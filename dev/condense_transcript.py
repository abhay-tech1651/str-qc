"""Condense a Claude Code session transcript (.jsonl) into readable text parts.

Keeps: the user's own words (system reminders stripped), assistant text, compaction
summaries, and a one-line note per tool call (tool name + file path or first part of
the command). Drops: tool results, thinking, attachments. Splits the output into parts
of about --part-kb kilobytes at message boundaries.

Usage: python condense_transcript.py <transcript.jsonl> <out_dir> [--part-kb 220]
Prints a JSON summary: parts written, sizes, message counts.
"""
import json
import re
import sys
from pathlib import Path

REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
PASTE_TAGS = re.compile(r"</?pasted_content[^>]*>")


def tool_note(block):
    name = block.get("name", "?")
    inp = block.get("input") or {}
    bits = []
    for key in ("file_path", "path", "url", "skill", "description", "action"):
        if inp.get(key):
            bits.append(f"{key}={str(inp[key])[:160]}")
    if "command" in inp:
        bits.append("command=" + " ".join(str(inp["command"]).split())[:300])
    if name == "Workflow" and inp.get("script"):
        meta = re.search(r"name:\s*'([^']+)'", inp["script"])
        bits.append("workflow=" + (meta.group(1) if meta else "?"))
    if name in ("AskUserQuestion",):
        for q in inp.get("questions", []):
            bits.append("Q: " + q.get("question", "")[:300])
    if name == "mcp__ccd_turn__wrap_up":
        bits.append("recap=" + str(inp.get("recap", ""))[:300])
        if inp.get("ask"):
            bits.append("ask=" + str(inp.get("ask"))[:200])
    return f"  [tool {name}] " + " | ".join(bits)


def text_of(content):
    if isinstance(content, str):
        return content
    out = []
    for b in content or []:
        if isinstance(b, dict) and b.get("type") == "text":
            out.append(b.get("text", ""))
    return "\n".join(out)


def main():
    src = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    part_kb = 220
    if "--part-kb" in sys.argv:
        part_kb = int(sys.argv[sys.argv.index("--part-kb") + 1])
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    counts = {"user": 0, "assistant": 0, "summary": 0, "tool_calls": 0}
    for line in src.open(encoding="utf-8"):
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("isSidechain"):
            continue
        ts = (rec.get("timestamp") or "")[:19]
        typ = rec.get("type")
        msg = rec.get("message") or {}
        if typ == "summary" and rec.get("summary"):
            entries.append(f"\n===== SUMMARY {ts}\n{rec['summary']}\n")
            counts["summary"] += 1
            continue
        if typ == "user":
            content = msg.get("content")
            if rec.get("isCompactSummary") or rec.get("isVisibleInTranscriptOnly"):
                txt = text_of(content)
                if txt.strip():
                    entries.append(f"\n===== COMPACTION SUMMARY {ts}\n{txt.strip()}\n")
                    counts["summary"] += 1
                continue
            if isinstance(content, list) and all(
                isinstance(b, dict) and b.get("type") == "tool_result" for b in content
            ):
                continue
            txt = REMINDER.sub("", text_of(content))
            txt = PASTE_TAGS.sub("", txt).strip()
            if txt and not txt.startswith("<command-") and "<local-command" not in txt[:40]:
                entries.append(f"\n===== USER {ts}\n{txt}\n")
                counts["user"] += 1
            elif txt.startswith("<command-"):
                entries.append(f"\n===== USER COMMAND {ts}\n{txt[:600]}\n")
                counts["user"] += 1
            continue
        if typ == "assistant":
            content = msg.get("content") or []
            parts = []
            for b in content:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and b.get("text", "").strip():
                    parts.append(b["text"].strip())
                elif b.get("type") == "tool_use":
                    parts.append(tool_note(b))
                    counts["tool_calls"] += 1
            if parts:
                entries.append(f"\n----- ASSISTANT {ts}\n" + "\n".join(parts) + "\n")
                counts["assistant"] += 1
    # split into parts
    limit = part_kb * 1024
    parts, cur, size = [], [], 0
    for e in entries:
        b = len(e.encode("utf-8"))
        if cur and size + b > limit:
            parts.append(cur)
            cur, size = [], 0
        cur.append(e)
        size += b
    if cur:
        parts.append(cur)
    written = []
    for i, p in enumerate(parts, 1):
        path = out_dir / f"part_{i:02d}.txt"
        text = "".join(p)
        path.write_text(text, encoding="utf-8")
        first = re.search(r"(USER|ASSISTANT|SUMMARY)[^\n]*?(\d{4}-\d\d-\d\dT[\d:]+)", text)
        last = re.findall(r"(\d{4}-\d\d-\d\dT[\d:]+)", text)
        written.append({
            "file": str(path),
            "kb": round(len(text.encode("utf-8")) / 1024),
            "from": first.group(2) if first else None,
            "to": last[-1] if last else None,
        })
    print(json.dumps({"counts": counts, "parts": written}, indent=1))


if __name__ == "__main__":
    main()

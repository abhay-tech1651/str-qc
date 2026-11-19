import "server-only";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

/**
 * The verified calculation engine. It is the same JavaScript that passes the 93 checks in tests-js/ (parity with the
 * Python reference model), loaded unchanged from ../apps-script into one sandboxed context, exactly as the tests do.
 */
import { repoRoot } from "./root";
const ENGINE_DIR = path.join(repoRoot(), "apps-script");
const FILES = ["00_Util.js", "01_Config.js", "10_Parse.js", "20_Model.js", "30_Store.js"];

type EngineCtx = {
  parseExport: (text: string) => { kind: string; rows: Record<string, unknown>[] };
  detectKind: (text: string) => string;
  parseAgencyTab: (title: string, values: unknown[][]) => Record<string, unknown>[];
  buildModel: (T: Record<string, unknown[]>, cfg: unknown, asOf: string) => { model: unknown; review: unknown[] };
  mergeRows_: (table: string, oldRows: unknown[], newRows: unknown[]) => unknown[];
  defaultConfig: () => Record<string, unknown>;
  tok: (s: string) => string[];
  parseNegative: (s: string) => [string, string[]];
  blocks: (match: string, words: string[], q: string[]) => boolean;
};

let ctx: EngineCtx | null = null;

function engine(): EngineCtx {
  if (!ctx) {
    const sandbox = vm.createContext({ console });
    for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ENGINE_DIR, f), "utf8"), sandbox, { filename: f });
    ctx = sandbox as unknown as EngineCtx;
  }
  return ctx;
}

/** Objects made inside the sandbox have their own prototypes; a JSON copy makes them plain. */
const plain = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;

/** Same rule the engine uses for said-vs-done: does this negative (as written in the change history) block this search? */
export function negativeBlocks(item: string, term: string): boolean {
  const E = engine();
  const mw = E.parseNegative(item);
  return !!E.blocks(mw[0], mw[1], E.tok(term));
}
export const tokens = (s: string) => plain<string[]>(engine().tok(s)).join(" ");

export const detectKind = (text: string) => engine().detectKind(text);
export const parseExport = (text: string) => plain<{ kind: string; rows: Record<string, unknown>[] }>(engine().parseExport(text));
export const parseAgencyTab = (title: string, values: unknown[][]) => plain<Record<string, unknown>[]>(engine().parseAgencyTab(title, values));
export const mergeRows = (table: string, oldRows: unknown[], newRows: unknown[]) => plain<Record<string, unknown>[]>(engine().mergeRows_(table, oldRows, newRows));
export const defaultConfig = () => plain<Record<string, unknown>>(engine().defaultConfig());
export function buildModel(T: Record<string, unknown[]>, cfg: unknown, asOf: string) {
  const out = engine().buildModel(T, cfg, asOf);
  return { model: plain<unknown>(out.model), review: plain<unknown[]>(out.review) };
}

/** The engine's word helpers, for checks written in TypeScript (lib/negatives-core.ts). */
export function engineHelpers() {
  const E = engine();
  return {
    tok: (s: string) => plain<string[]>(E.tok(s)),
    parseNegative: (s: string) => plain<[string, string[]]>(E.parseNegative(s)),
    blocks: (m: string, w: string[], q: string[]) => !!E.blocks(m, w, q),
  };
}

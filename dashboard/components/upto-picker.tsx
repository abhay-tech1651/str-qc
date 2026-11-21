"use client";
/** "Checked up to": the last sheet day the ledger includes. Kept in the address (?to=), so a link shows the same view. */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "./ui";
import { dshort } from "@/lib/format";

export function UpToPicker({ days, value }: { days: string[]; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = React.useTransition();
  const pick = (d: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set("to", d);
    start(() => router.push(`${path}?${q}`));
  };
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
      Checked up to
      <Select aria-label="Checked up to" value={value} onChange={(e) => pick(e.target.value)} className={`h-8 w-[120px] text-[13px] ${pending ? "opacity-60" : ""}`}>
        {[...days].reverse().map((d) => <option key={d} value={d}>{dshort(d)}</option>)}
      </Select>
    </label>
  );
}

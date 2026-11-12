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

export const detectKind = (text: string) => engine().detectKind(text);
export const parseExport = (text: string) => plain<{ kind: string; rows: Record<string, unknown>[] }>(engine().parseExport(text));
export const parseAgencyTab = (title: string, values: unknown[][]) => plain<Record<string, unknown>[]>(engine().parseAgencyTab(title, values));
export const mergeRows = (table: string, oldRows: unknown[], newRows: unknown[]) => plain<Record<string, unknown>[]>(engine().mergeRows_(table, oldRows, newRows));
export const defaultConfig = () => plain<Record<string, unknown>>(engine().defaultConfig());
export function buildModel(T: Record<string, unknown[]>, cfg: unknown, asOf: string) {
  const out = engine().buildModel(T, cfg, asOf);
  return { model: plain<unknown>(out.model), review: plain<unknown[]>(out.review) };
}

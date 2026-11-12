import "server-only";
import fs from "node:fs";
import path from "node:path";

/** The str-qc folder (it holds apps-script/ with the engine, inbox/ and data/), wherever the app was started from. */
export function repoRoot(): string {
  const env = process.env.QC_ROOT;
  if (env && fs.existsSync(path.join(env, "apps-script"))) return env;
  for (const dir of [process.cwd(), path.resolve(process.cwd(), ".."), path.resolve(process.cwd(), "str-qc")]) {
    if (fs.existsSync(path.join(dir, "apps-script", "20_Model.js"))) return dir;
  }
  throw new Error("Cannot find the str-qc folder (apps-script/20_Model.js). Start the dashboard from str-qc/dashboard.");
}

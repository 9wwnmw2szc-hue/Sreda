/**
 * @deprecated Use scripts/ui-audit-capture.mjs — kept as a thin alias so
 * older docs / local habits keep working.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, "ui-audit-capture.mjs");

console.warn(
  "[deprecated] scripts/visual-polish-capture.mjs → scripts/ui-audit-capture.mjs",
);

const child = spawn(process.execPath, [target], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

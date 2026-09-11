// Accept the supervised preview's Vite-style flags while retaining Next.js.
// Normal `npm run dev` remains equivalent to `next dev`.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const args = process.argv
  .slice(2)
  .filter((arg) => arg !== "--strictPort")
  .map((arg) => (arg === "--host" ? "--hostname" : arg));
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", ...args],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const inputFile = args[0] ?? "wasm/terrain.c";
const outputFile = args[1] ?? "public/terrain.wasm";
const enableSimd = args[2] === "--simd" || args[2] === "true";

const scriptPath = resolve(dirname(new URL(import.meta.url).pathname), "compile-wasm.sh");

const result = spawnSync("bash", [scriptPath, inputFile, outputFile, String(enableSimd)], {
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

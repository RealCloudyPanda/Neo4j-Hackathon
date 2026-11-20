#!/usr/bin/env node
// Thin launcher: run the TypeScript CLI through tsx so there is no build step.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  ["--import", import.meta.resolve("tsx"), join(root, "src/cli/index.ts"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 2);

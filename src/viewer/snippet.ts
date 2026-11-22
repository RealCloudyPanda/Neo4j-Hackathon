import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { snapshotDirectory } from "../graph/catalog.ts";

export function snippet(snapshot: string, path: string, line: number) {
  const root = snapshotDirectory(snapshot);
  if (!root || !Number.isInteger(line) || line < 1) return null;
  const file = resolve(root, path);
  const rel = relative(root, file);
  if (rel.startsWith("..") || rel.includes(`..${sep}`) || !existsSync(file) || !statSync(file).isFile()) return null;
  const lines = readFileSync(file, "utf8").split("\n");
  const from = Math.max(1, line - 3);
  const to = Math.min(lines.length, line + 3);
  return { path, line, from, lines: lines.slice(from - 1, to) };
}

import { basename, resolve } from "node:path";
import { extractFields } from "./fields.ts";
import { extractFiles } from "./files.ts";
import { extractImports } from "./imports.ts";
import { readLinks } from "./links.ts";
import { createProject } from "./project.ts";
import type { SnapshotData } from "./types.ts";
import { extractUsages } from "./usages.ts";

export const SNAPSHOT_TITLES: Record<string, string> = {
  base: "Base (main)",
  "pr-duration-ms": "PR: report fulfilment time in milliseconds",
  "pr-weight-kg": "PR: send parcel weight in kilograms",
};

/** Parse one snapshot folder into plain records. */
export function extractSnapshot(dirIn: string, id = basename(dirIn)): SnapshotData {
  const dir = resolve(dirIn);
  const project = createProject(dir);
  const files = extractFiles(project, dir);
  const imports = extractImports(project, dir);
  const fieldDecls = extractFields(project, dir);
  const { producers, usages } = extractUsages(fieldDecls, dir);
  const fields = fieldDecls.map((f) => f.rec);
  const links = readLinks(dir, new Set(fields.map((f) => f.key)));
  return { id, title: SNAPSHOT_TITLES[id] ?? id, dir, files, imports, fields, producers, usages, links };
}

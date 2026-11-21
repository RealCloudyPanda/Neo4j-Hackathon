import type { Project } from "ts-morph";
import { isInside, relPath } from "./project.ts";
import type { ImportRec } from "./types.ts";

export function extractImports(project: Project, dir: string): ImportRec[] {
  const out: ImportRec[] = [];
  for (const sf of project.getSourceFiles()) {
    if (!isInside(dir, sf)) continue;
    for (const decl of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
      const target = decl.getModuleSpecifierSourceFile();
      if (!target || !isInside(dir, target)) continue;
      out.push({ from: relPath(dir, sf), to: relPath(dir, target), specifier: decl.getModuleSpecifierValue() ?? "" });
    }
  }
  return out;
}

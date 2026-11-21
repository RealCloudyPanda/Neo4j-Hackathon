import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { Project, type SourceFile } from "ts-morph";

export function createProject(dir: string): Project {
  const tsConfigFilePath = join(dir, "tsconfig.json");
  if (existsSync(tsConfigFilePath)) return new Project({ tsConfigFilePath });
  const project = new Project({ compilerOptions: { strict: true, allowJs: false } });
  project.addSourceFilesAtPaths([join(dir, "**/*.ts"), `!${join(dir, "**/node_modules/**")}`]);
  return project;
}

export function relPath(dir: string, sf: SourceFile | string): string {
  const abs = typeof sf === "string" ? sf : sf.getFilePath();
  return relative(dir, abs).split(sep).join("/");
}

export function isInside(dir: string, sf: SourceFile): boolean {
  const rel = relPath(dir, sf);
  return !rel.startsWith("..") && !rel.includes("node_modules/");
}

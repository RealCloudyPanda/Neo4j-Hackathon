import { createHash } from "node:crypto";
import type { Project } from "ts-morph";
import { isInside, relPath } from "./project.ts";
import type { FileRec } from "./types.ts";

export function packageOf(path: string): string {
  const m = /^(apps|packages)\/([^/]+)\//.exec(path);
  return m ? `${m[1]}/${m[2]}` : ".";
}

export const isTestPath = (path: string): boolean => /\.(test|spec)\.tsx?$/.test(path);

export function extractFiles(project: Project, dir: string): FileRec[] {
  return project
    .getSourceFiles()
    .filter((sf) => isInside(dir, sf))
    .map((sf) => {
      const path = relPath(dir, sf);
      return {
        path,
        package: packageOf(path),
        isTest: isTestPath(path),
        hash: createHash("sha1").update(sf.getFullText()).digest("hex"),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

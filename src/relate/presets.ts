import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { QUERIES_DIR } from "./store.ts";

export const PRESETS_DIR = join(QUERIES_DIR, "presets");

export interface Preset {
  name: string;
  title: string;
  cypher: string;
}

const TITLE_LINE = /^\/\/\s*([^:\n]+)/;

export function listPresets(dir = PRESETS_DIR): Preset[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".cypher"))
    .sort()
    .map((f) => {
      const cypher = readFileSync(join(dir, f), "utf8").trim();
      const title = TITLE_LINE.exec(cypher)?.[1].trim() ?? f;
      return { name: f.replace(/\.cypher$/, ""), title, cypher };
    });
}

export function findPreset(name: string, dir = PRESETS_DIR): Preset | undefined {
  return listPresets(dir).find((p) => p.name === name);
}

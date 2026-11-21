import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LinkRec } from "./types.ts";

export const LINKS_FILE = "contract-drift.links.json";

export class LinkManifestError extends Error {}

export function readLinks(dir: string, knownKeys: Set<string>): LinkRec[] {
  const file = join(dir, LINKS_FILE);
  if (!existsSync(file)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new LinkManifestError(`${file}: not valid JSON (${(err as Error).message})`);
  }
  const links = (raw as { links?: unknown })?.links;
  if (!Array.isArray(links)) throw new LinkManifestError(`${file}: expected { "links": [ ... ] }`);
  return links.map((l, i) => {
    const at = `${file} links[${i}]`;
    if (!l || typeof l !== "object") throw new LinkManifestError(`${at}: expected an object`);
    const { from, to, via, reason } = l as Record<string, unknown>;
    for (const [name, v] of Object.entries({ from, to, via })) {
      if (typeof v !== "string" || !v) throw new LinkManifestError(`${at}: "${name}" must be a non-empty string`);
    }
    const resolveKey = (name: string, key: unknown): string => {
      const selector = String(key);
      if (knownKeys.has(selector)) return selector;
      const matches = [...knownKeys].filter(k => k.endsWith(`#${selector}`));
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) throw new LinkManifestError(`${at}: "${name}" selector "${selector}" is ambiguous. Use a qualified key: ${matches.sort().join(", ")}`);
      throw new LinkManifestError(`${at}: "${name}" names unknown contract field "${selector}". Known: ${[...knownKeys].sort().join(", ")}`);
    };
    return { from: resolveKey("from", from), to: resolveKey("to", to), via: via as string, reason: typeof reason === "string" ? reason : "" };
  });
}

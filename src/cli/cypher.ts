import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NodeValue, RelationshipValue } from "@relate/relate";
import { DEFAULT_STORE, describeError, openStore, QUERIES_DIR } from "../relate/store.ts";
import { writeClause } from "../relate/guard.ts";
import { parseArgs } from "./args.ts";

export const PRESETS_DIR = join(QUERIES_DIR, "presets");

export function listPresets(): { name: string; title: string; cypher: string }[] {
  return readdirSync(PRESETS_DIR)
    .filter((f) => f.endsWith(".cypher"))
    .sort()
    .map((f) => {
      const cypher = readFileSync(join(PRESETS_DIR, f), "utf8").trim();
      const title = /^\/\/\s*([^:\n]+)/.exec(cypher)?.[1].trim() ?? f;
      return { name: f.replace(/\.cypher$/, ""), title, cypher };
    });
}

const isNode = (v: unknown): v is NodeValue => !!v && typeof v === "object" && (v as NodeValue).kind === "node";
const isRel = (v: unknown): v is RelationshipValue => !!v && typeof v === "object" && (v as RelationshipValue).kind === "relationship";

export function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (isNode(v)) return `(:${v.labels.join(":")} ${String(v.properties.id ?? v.properties.key ?? v.elementId)})`;
  if (isRel(v)) return `[:${v.type}]`;
  if (Array.isArray(v)) return `[${v.map(cell).join(", ")}]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function table(columns: string[], rows: Record<string, unknown>[]): string {
  const cells = rows.map((r) => columns.map((c) => cell(r[c])));
  const widths = columns.map((c, i) => Math.min(70, Math.max(c.length, ...cells.map((r) => r[i].length))));
  const line = (vals: string[]) => vals.map((v, i) => (v.length > widths[i] ? v.slice(0, widths[i] - 1) + "…" : v.padEnd(widths[i]))).join("  ").trimEnd();
  return [line(columns), widths.map((w) => "─".repeat(w)).join("  "), ...cells.map(line)].join("\n");
}

/** Read-only Cypher against the committed store. */
export async function runCypher(argv: string[]): Promise<number> {
  const { flags, positional } = parseArgs(argv, ["list-presets"]);
  if (flags["list-presets"]) {
    for (const p of listPresets()) console.log(`${p.name.padEnd(20)} ${p.title}`);
    return 0;
  }
  let cypher = positional.join(" ").trim();
  if (typeof flags.preset === "string") {
    const p = listPresets().find((x) => x.name === flags.preset);
    if (!p) {
      console.error(`Unknown preset "${flags.preset}". Try: ${listPresets().map((x) => x.name).join(", ")}`);
      return 2;
    }
    cypher = p.cypher;
  }
  if (!cypher) {
    console.error('Usage: npm run cypher -- "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n"   or   --preset <name>');
    return 2;
  }
  const w = writeClause(cypher);
  if (w) {
    console.error(`Refused: ${w} would write. This console is read-only; the store is rebuilt with npm run build:graph.`);
    return 2;
  }
  try {
    const store = openStore(typeof flags.store === "string" ? flags.store : DEFAULT_STORE, { readOnly: true });
    const res = store.conn.query(cypher);
    console.log(table(res.columns, res.rows));
    console.log(`\n${res.rows.length} row${res.rows.length === 1 ? "" : "s"}`);
    return 0;
  } catch (err) {
    console.error(describeError(err));
    return 2;
  }
}

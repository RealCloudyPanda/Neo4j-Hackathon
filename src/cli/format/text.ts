import { styleText } from "node:util";
import type { Review } from "../../review/read.ts";
import type { Verdict } from "../../review/types.ts";

type Style = Parameters<typeof styleText>[0];

export interface TextOptions {
  color: boolean;
  storeLabel: string;
  cypher?: string[];
}

const VERDICT_STYLE: Record<Verdict, Style> = { MISMATCH: ["bold", "red"], REVIEW: ["bold", "yellow"], OK: "green", TEST: "cyan" };

export function formatText(r: Review, o: TextOptions): string {
  const s = (style: Style, text: string) => (o.color ? styleText(style, text) : text);
  const out: string[] = [];
  out.push("");
  out.push(`${s("bold", "Contract Drift")}  ${r.base} → ${r.head}        ${s("dim", `store ${o.storeLabel}`)}`);
  out.push("");
  if (!r.drifts.length) {
    out.push(s("green", `No meaning changes between ${r.base} and ${r.head}.`) + " Nothing to review.");
    out.push("");
    return out.join("\n");
  }
  for (const d of r.drifts) {
    out.push(`${s(["bold", "red"], "DRIFT")}  ${s("bold", d.key)}   @${d.tag} ${d.before} → ${s("bold", d.after)}`);
    out.push(`       ${s("dim", "declared")}   ${d.declared.path}:${d.declared.line}`);
    for (const p of d.producers) {
      out.push(`       ${s("dim", "produced")}   ${p.name}  ${p.path}:${p.line}${p.inDiff ? s("dim", "   (in diff)") : ""}`);
    }
    out.push("");
    out.push(`${s("bold", "Reviewer shortlist")}${" ".repeat(51)}${s("dim", "in diff")}`);
    for (const e of d.entries) {
      const loc = e.line ? `${e.path}:${e.line}` : e.path;
      const diff = e.inDiff ? "yes" : "no ";
      const note = e.verdict === "TEST" && !e.inDiff ? s(["bold", "cyan"], "  ← not in this PR") : "";
      out.push(`  ${String(e.rank).padStart(2)}  ${s(VERDICT_STYLE[e.verdict], e.verdict.padEnd(8))}  ${loc.padEnd(52)} ${diff}${note}`);
      const pad = " ".repeat(16);
      if (e.code) out.push(`${pad}${s("dim", e.code)}`);
      out.push(`${pad}${e.reason}`);
      if (e.detail && e.verdict !== "TEST") out.push(`${pad}${s("dim", e.detail)}`);
      if (e.verdict !== "TEST") out.push(`${pad}${s("dim", `path  ${e.pathText}`)}`);
    }
    out.push("");
  }
  const c = r.counts;
  const tally = [`${c.MISMATCH} MISMATCH`, `${c.REVIEW} REVIEW`, c.OK ? `${c.OK} OK` : "", `${c.TEST} tests`].filter(Boolean).join(" · ");
  out.push(`Not affected: ${r.notAffected.usages} other usages of ${r.notAffected.fields} contract fields.   ${s("bold", tally)}`);
  out.push(
    s("dim", `Explore: npm run viewer   ·   Query: npm run cypher -- --preset impact-paths`),
  );
  if (o.cypher?.length) {
    out.push("");
    out.push(s("bold", "Cypher used"));
    for (const q of o.cypher) out.push(s("dim", q), "");
  }
  out.push("");
  return out.join("\n");
}

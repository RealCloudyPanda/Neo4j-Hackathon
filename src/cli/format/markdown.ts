import type { Review } from "../../review/read.ts";

const ICON = { MISMATCH: "**MISMATCH**", REVIEW: "REVIEW", OK: "OK", TEST: "TEST" } as const;
const esc = (s: string) => s.replace(/\|/g, "\\|");

export function formatMarkdown(r: Review): string {
  const out: string[] = [`### Contract Drift: \`${r.base}\` → \`${r.head}\``, ""];
  if (!r.drifts.length) return [...out, "No meaning changes. Nothing to review."].join("\n");
  for (const d of r.drifts) {
    out.push(`**\`${d.key}\`** \`@${d.tag}\` ${d.before} → **${d.after}** (declared \`${d.declared.path}:${d.declared.line}\`)`, "");
    out.push("| # | Verdict | Where | Why | In diff |", "| - | - | - | - | - |");
    for (const e of d.entries) {
      const loc = e.line ? `${e.path}:${e.line}` : e.path;
      const why = esc(e.reason) + (e.code ? `<br>\`${esc(e.code)}\`` : "");
      out.push(`| ${e.rank} | ${ICON[e.verdict]} | \`${loc}\` | ${why} | ${e.inDiff ? "yes" : "**no**"} |`);
    }
    out.push("", "<details><summary>Impact paths</summary>", "");
    for (const e of d.entries) out.push(`- \`${e.path}\`: ${e.pathText}${e.detail ? ` (${e.detail})` : ""}`);
    out.push("", "</details>", "");
  }
  const c = r.counts;
  out.push(`${c.MISMATCH} MISMATCH · ${c.REVIEW} REVIEW · ${c.TEST} tests. Not affected: ${r.notAffected.usages} other usages.`);
  return out.join("\n");
}

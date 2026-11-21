import { loadQuery, type Store } from "../relate/store.ts";
import type { DriftRow, Entry, Verdict } from "./types.ts";

interface ImpactRow {
  usageId: string;
  flowNote: string | null;
  path: string;
  line: number;
  code: string;
  viaKey: string;
  viaTag: string | null;
  param: string | null;
  paramTag: string | null;
  paramLine: number | null;
  fn: string | null;
  fnPath: string | null;
  hops: number;
  rels: string[];
  linkVia: string[];
}

const NEXT: Record<string, string> = { LINKED_TO: "FieldVersion", READ_AT: "Usage", PASSES_TO: "Param", PARAM_OF: "Function" };

export function pathText(rels: string[]): string {
  return ["FieldVersion", ...rels.map((r) => `─${r}→ ${NEXT[r] ?? "?"}`)].join(" ");
}

/** Verdict rules from SPEC §3: compare the tag stated on the path with the drift's before / after. */
export function judge(d: DriftRow, r: ImpactRow): { verdict: Verdict; reason: string; detail: string | null } {
  const at = `@${d.tag}`;
  if (r.flowNote) return { verdict: 'REVIEW', reason: r.flowNote, detail: null };
  if (d.after === '<removed>') return { verdict: 'REVIEW', reason: `${at} metadata removed; meaning is now unspecified, verify this consumer by hand`, detail: null };
  if (r.param && r.paramTag) {
    const where = `${r.fnPath}:${r.paramLine}`;
    const stated = `passes to ${r.fn}(${r.param}) ${at} ${r.paramTag}`;
    if (r.paramTag === d.after) return { verdict: "OK", reason: `${stated}: already updated`, detail: where };
    return { verdict: "MISMATCH", reason: stated, detail: where };
  }
  if (r.viaKey !== d.key) {
    const link = `hidden link: ${d.key} → ${r.viaKey}`;
    const via = r.linkVia.length ? `via ${r.linkVia.join(", ")} (contract-drift.links.json)` : null;
    if (r.viaTag === d.after) return { verdict: "OK", reason: `${link} (${at} ${r.viaTag}): already updated`, detail: via };
    if (r.viaTag) return { verdict: "MISMATCH", reason: `${link} (${at} ${r.viaTag})`, detail: via };
    return { verdict: "REVIEW", reason: `${link}; no meaning tag on the linked field`, detail: via };
  }
  return { verdict: "REVIEW", reason: "reads the field; no meaning tag on the way, check by hand", detail: null };
}

/** Run impact.cypher for one drift and turn each row into a shortlist entry. */
export function impactEntries(store: Store, d: DriftRow): Omit<Entry, "rank">[] {
  const rows = store.query<ImpactRow & Record<string, unknown>>(loadQuery("impact"), { headId: d.headId, tag: d.tag });
  const inDiff = new Map(
    store
      .query<{ path: string; inDiff: boolean }>(
        "MATCH (:Snapshot {id:$head})-[:CONTAINS]->(f:File) RETURN f.path AS path, f.inDiff AS inDiff",
        { head: d.headId.split(":")[0] },
      )
      .map((r) => [r.path, Boolean(r.inDiff)]),
  );
  return rows.map((r) => {
    const rels = r.param ? [...r.rels, "PASSES_TO", "PARAM_OF"] : r.rels;
    return {
      targetId: r.usageId,
      path: r.path,
      line: Number(r.line),
      code: r.code,
      hops: Number(r.hops),
      pathText: pathText(rels),
      inDiff: inDiff.get(r.path) ?? false,
      ...judge(d, r),
    };
  });
}

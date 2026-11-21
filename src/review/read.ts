import type { Store } from "../relate/store.ts";
import type { Entry, Verdict } from "./types.ts";

export interface ProducerInfo {
  name: string;
  path: string;
  line: number;
  inDiff: boolean;
}

export interface DriftReport {
  id: string;
  key: string;
  displayName: string;
  tag: string;
  before: string;
  after: string;
  declared: { path: string; line: number };
  producers: ProducerInfo[];
  entries: Entry[];
}

export interface Review {
  base: string;
  head: string;
  drifts: DriftReport[];
  counts: Record<Verdict, number>;
  notAffected: { usages: number; fields: number };
}

/** Reader side: everything comes from saved Drift / FLAGS, so this works on a read-only store. */
export function readReview(store: Store, base: string, head: string): Review {
  const drifts = store.query<Record<string, unknown>>(
    `MATCH (d:Drift {base: $base, head: $head})-[:AFTER]->(h:FieldVersion)
     RETURN d.id AS id, d.key AS key, d.tag AS tag, d.before AS before, d.after AS after,
            h.path AS path, h.line AS line
     ORDER BY d.key, d.tag`,
    { base, head },
  );
  const reports: DriftReport[] = drifts.map((d) => {
    const producers = store
      .query<Record<string, unknown>>(
        `MATCH (:Drift {id: $id})-[:AFTER]->(h:FieldVersion)<-[:WRITES]-(p:Producer {inTest: false})-[:IN_FILE]->(f:File)
         RETURN p.name AS name, p.path AS path, p.line AS line, f.inDiff AS inDiff ORDER BY path, line`,
        { id: d.id as string },
      )
      .map((p) => ({ name: String(p.name), path: String(p.path), line: Number(p.line), inDiff: Boolean(p.inDiff) }));
    const entries = store
      .query<Record<string, unknown>>(
        `MATCH (:Drift {id: $id})-[r:FLAGS]->(x)
         OPTIONAL MATCH (x)-[:IN_FILE]->(uf:File)
         RETURN x.id AS targetId, r.rank AS rank, r.verdict AS verdict, r.reason AS reason, r.detail AS detail,
                r.hops AS hops, r.pathText AS pathText, r.reaches AS reaches, x.path AS path, x.line AS line, x.code AS code,
                coalesce(uf.inDiff, x.inDiff) AS inDiff
         ORDER BY rank`,
        { id: d.id as string },
      )
      .map(
        (e): Entry => ({
          targetId: String(e.targetId),
          rank: Number(e.rank),
          verdict: e.verdict as Verdict,
          reason: String(e.reason ?? ""),
          detail: (e.detail as string | null) ?? null,
          hops: Number(e.hops),
          pathText: String(e.pathText ?? ""),
          path: String(e.path),
          line: e.line == null ? null : Number(e.line),
          code: (e.code as string | null) ?? null,
          inDiff: Boolean(e.inDiff),
          reaches: (e.reaches as string[] | null) ?? [],
        }),
      );
    return {
      id: String(d.id),
      key: String(d.key),
      displayName: String(d.key).split("#").pop()!,
      tag: String(d.tag),
      before: String(d.before),
      after: String(d.after),
      declared: { path: String(d.path), line: Number(d.line) },
      producers,
      entries,
    };
  });

  const counts: Record<Verdict, number> = { MISMATCH: 0, REVIEW: 0, OK: 0, TEST: 0 };
  for (const d of reports) for (const e of d.entries) counts[e.verdict]++;
  const flagged = reports.flatMap((d) => d.entries.map((e) => e.targetId));
  const other = store.query<{ usages: number; fields: number }>(
    `MATCH (v:FieldVersion {snapshot: $head})-[:READ_AT]->(u:Usage {inTest: false})
     WHERE NOT u.id IN $flagged AND (v.unit IS NOT NULL OR v.format IS NOT NULL OR v.tz IS NOT NULL)
     RETURN count(u) AS usages, count(DISTINCT v.key) AS fields`,
    { head, flagged },
  )[0] ?? { usages: 0, fields: 0 };
  return {
    base,
    head,
    drifts: reports,
    counts,
    notAffected: { usages: Number(other.usages), fields: Number(other.fields) },
  };
}

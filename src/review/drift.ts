import { markInDiff } from "../graph/load.ts";
import { loadQuery, type Store } from "../relate/store.ts";
import type { DriftRow } from "./types.ts";

export const driftId = (base: string, head: string, key: string, tag: string) => `${base}..${head}:${key}:${tag}`;

export function detectDrifts(store: Store, base: string, head: string): DriftRow[] {
  markInDiff(store, base, head);
  const rows = store.query<Omit<DriftRow, "id">>(loadQuery("drift"), { base, head });
  const drifts = rows.map((r) => ({ ...r, id: driftId(base, head, r.key, r.tag) }));
  for (const d of drifts) {
    store.query(
      `MATCH (f:Field {key: $key}), (b:FieldVersion {id: $baseId}), (h:FieldVersion {id: $headId})
       MERGE (d:Drift {id: $id})
       SET d.base = $base, d.head = $head, d.key = $key, d.tag = $tag, d.before = $before, d.after = $after
       MERGE (d)-[:ON]->(f)
       MERGE (d)-[:BEFORE]->(b)
       MERGE (d)-[:AFTER]->(h)`,
      { ...d, base, head },
    );
  }
  return drifts;
}

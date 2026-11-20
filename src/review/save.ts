import type { Params, Store } from "../relate/store.ts";
import type { Entry } from "./types.ts";

/** Persist shortlist entries as (:Drift)-[:FLAGS {rank, verdict, reason, hops, pathText}]->(Usage|File). */
export function saveFlags(store: Store, driftId: string, entries: Omit<Entry, "rank">[] | Entry[]): void {
  if (!entries.length) return;
  store.query(
    `MATCH (d:Drift {id: $driftId})
     UNWIND $rows AS r
     MATCH (x {id: r.targetId})
     WHERE x:Usage OR x:File
     MERGE (d)-[f:FLAGS]->(x)
     SET f.rank = r.rank, f.verdict = r.verdict, f.reason = r.reason, f.detail = r.detail,
         f.hops = r.hops, f.pathText = r.pathText`,
    {
      driftId,
      rows: entries.map((e) => ({
        targetId: e.targetId,
        rank: "rank" in e ? e.rank : 0,
        verdict: e.verdict,
        reason: e.reason,
        detail: e.detail,
        hops: e.hops,
        pathText: e.pathText,
      })),
    } as Params,
  );
}

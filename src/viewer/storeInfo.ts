import { statSync } from "node:fs";
import { relative } from "node:path";
import { readMeta } from "../graph/build.ts";
import { ROOT, type Store } from "../relate/store.ts";

export function storeInfo(store: Store) {
  const labels = store.query<{ label: string; n: number }>(
    "MATCH (n) UNWIND labels(n) AS label RETURN label, count(*) AS n ORDER BY n DESC, label",
  );
  const rels = store.query<{ type: string; n: number }>("MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS n ORDER BY n DESC, type");
  return {
    path: relative(ROOT, store.path),
    absPath: store.path,
    sizeBytes: statSync(store.path).size,
    mode: "single file (.rl)",
    readOnly: store.readOnly,
    meta: readMeta(store),
    labels: labels.map((r) => ({ label: r.label, n: Number(r.n) })),
    relationships: rels.map((r) => ({ type: r.type, n: Number(r.n) })),
    relateCli: `relate --database ./${relative(ROOT, store.path)} --read-only "MATCH (d:Drift)-[r:FLAGS]->(x) RETURN d.key, r.verdict, x.path"`,
  };
}

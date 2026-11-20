import { loadQuery, type Store } from "../relate/store.ts";
import type { DriftRow, Entry } from "./types.ts";

interface TestRow {
  fileId: string;
  path: string;
  inDiff: boolean | null;
  hops: number;
  reaches: string[];
}

/** Tests that reach flagged usages through imports, plus tests that read the field themselves. */
export function testEntries(store: Store, d: DriftRow, head: string): Omit<Entry, "rank">[] {
  const byPath = new Map<string, TestRow>();
  const rows = [
    ...store.query<TestRow & Record<string, unknown>>(loadQuery("tests-direct"), { headId: d.headId }),
    ...store.query<TestRow & Record<string, unknown>>(loadQuery("tests"), { driftId: d.id, head }),
  ];
  for (const r of rows) {
    const prev = byPath.get(r.path);
    if (!prev || Number(r.hops) < Number(prev.hops)) byPath.set(r.path, r);
  }
  return [...byPath.values()].map((r) => {
    const hops = Number(r.hops);
    const inDiff = Boolean(r.inDiff);
    return {
      targetId: r.fileId,
      verdict: "TEST" as const,
      path: r.path,
      line: null,
      code: null,
      hops,
      inDiff,
      reason: hops === 0 ? "reads the field itself" : `imports ${r.reaches.join(", ")}${hops > 1 ? ` (${hops} hops)` : ""}`,
      detail: inDiff ? "changed in this PR" : "not in this PR",
      pathText: hops === 0 ? "Test ─reads→ field" : `Test ─IMPORTS${hops > 1 ? `×${hops}` : ""}→ File`,
    };
  });
}

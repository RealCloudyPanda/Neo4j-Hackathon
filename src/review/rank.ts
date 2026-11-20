import type { Entry, Verdict } from "./types.ts";

const ORDER: Record<Verdict, number> = { MISMATCH: 0, REVIEW: 1, TEST: 2, OK: 3 };

/** MISMATCH, REVIEW, TEST (not in diff first), OK; then fewer hops; then path. Assigns 1-based rank. */
export function rankEntries(entries: Omit<Entry, "rank">[]): Entry[] {
  return [...entries]
    .sort(
      (a, b) =>
        ORDER[a.verdict] - ORDER[b.verdict] ||
        (a.verdict === "TEST" ? Number(a.inDiff) - Number(b.inDiff) : 0) ||
        a.hops - b.hops ||
        a.path.localeCompare(b.path) ||
        (a.line ?? 0) - (b.line ?? 0),
    )
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

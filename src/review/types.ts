export type Verdict = "MISMATCH" | "REVIEW" | "OK" | "TEST";

export interface DriftRow {
  id: string;
  key: string;
  tag: string;
  before: string;
  after: string;
  baseId: string;
  headId: string;
}

/** One shortlist entry. `targetId` is the Usage or File the Drift FLAGS. */
export interface Entry {
  targetId: string;
  verdict: Verdict;
  path: string;
  line: number | null;
  code: string | null;
  reason: string;
  detail: string | null;
  hops: number;
  pathText: string;
  inDiff: boolean;
  rank: number;
  /** For TEST entries: the files this test reaches through imports. */
  reaches?: string[];
}

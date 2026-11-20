import type { Review } from "../../review/read.ts";

/** Stable machine-readable schema (schema: "contract-drift/v1"). */
export function formatJson(r: Review, meta: { store: string; cypher: string[] }): string {
  return JSON.stringify({ schema: "contract-drift/v1", store: meta.store, ...r, cypher: meta.cypher }, null, 2);
}

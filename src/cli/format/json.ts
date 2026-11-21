import type { Review } from "../../review/read.ts";

export function formatJson(r: Review, meta: { store: string; cypher: string[] }): string {
  return JSON.stringify({ schema: "contract-drift/v1", store: meta.store, ...r, cypher: meta.cypher }, null, 2);
}

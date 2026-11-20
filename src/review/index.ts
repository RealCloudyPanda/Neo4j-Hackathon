import type { Store } from "../relate/store.ts";
import { detectDrifts } from "./drift.ts";
import { impactEntries } from "./impact.ts";
import { rankEntries } from "./rank.ts";
import { saveFlags } from "./save.ts";
import { testEntries } from "./tests.ts";

/**
 * Writer side: detect drifts between base and head, compute impact and tests, save FLAGS.
 * Usage FLAGS are saved first because tests.cypher starts from them.
 */
export function computeReview(store: Store, base: string, head: string): number {
  const drifts = detectDrifts(store, base, head);
  for (const d of drifts) {
    const usages = impactEntries(store, d);
    saveFlags(store, d.id, usages);
    const ranked = rankEntries([...usages, ...testEntries(store, d, head)]);
    saveFlags(store, d.id, ranked);
  }
  return drifts.length;
}

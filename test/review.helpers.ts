import { applySchema } from "../src/graph/schema.ts";
import { loadSnapshot } from "../src/graph/load.ts";
import { openStore, type Store } from "../src/relate/store.ts";
import { computeReview } from "../src/review/index.ts";
import { readReview, type Review } from "../src/review/read.ts";
import { snapshot } from "./helpers.ts";

let store: Store | undefined;
export function fixtureStore(): Store {
  if (!store) {
    store = openStore(":memory:");
    applySchema(store);
    for (const id of ["base", "pr-duration-ms", "pr-weight-kg"]) loadSnapshot(store, snapshot(id));
    for (const head of ["base", "pr-duration-ms", "pr-weight-kg"]) computeReview(store, "base", head);
  }
  return store;
}

export const review = (head: string): Review => readReview(fixtureStore(), "base", head);

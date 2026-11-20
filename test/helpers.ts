import { join } from "node:path";
import { extractSnapshot } from "../src/extract/index.ts";
import type { SnapshotData } from "../src/extract/types.ts";
import { ROOT } from "../src/relate/store.ts";

const cache = new Map<string, SnapshotData>();
export function snapshot(id: string): SnapshotData {
  let s = cache.get(id);
  if (!s) {
    s = extractSnapshot(join(ROOT, "examples/shop-monorepo/snapshots", id), id);
    cache.set(id, s);
  }
  return s;
}

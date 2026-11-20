import { test } from "node:test";
import assert from "node:assert/strict";
import { review } from "./review.helpers.ts";

test("weight PR: flags shippingLabel.ts and nothing under apps/worker/", () => {
  const r = review("pr-weight-kg");
  assert.equal(r.drifts.length, 1);
  const entries = r.drifts[0].entries;
  assert.ok(entries.some((e) => e.verdict === "MISMATCH" && e.path === "apps/web/src/views/shippingLabel.ts"));
  assert.deepEqual(entries.filter((e) => e.path.startsWith("apps/worker/")), []);
});

test("base..base: no meaning changes", () => {
  assert.equal(review("base").drifts.length, 0);
});

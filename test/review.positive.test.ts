import { test } from "node:test";
import assert from "node:assert/strict";
import { review } from "./review.helpers.ts";

test("duration PR: one drift, seconds → milliseconds", () => {
  const r = review("pr-duration-ms");
  assert.equal(r.drifts.length, 1);
  const d = r.drifts[0];
  assert.deepEqual([d.key, d.tag, d.before, d.after], ["packages/contracts/src/order.ts#OrderSummary.duration", "unit", "seconds", "milliseconds"]);
  assert.deepEqual(d.producers.map((p) => [p.name, p.inDiff]), [["order.summary", true]]);
});

test("duration PR: MISMATCH orderRow, MISMATCH sla (hidden link), REVIEW events, in that order", () => {
  const e = review("pr-duration-ms").drifts[0].entries.filter((x) => x.verdict !== "TEST");
  assert.deepEqual(
    e.map((x) => [x.verdict, x.path]),
    [
      ["MISMATCH", "apps/web/src/views/orderRow.ts"],
      ["MISMATCH", "apps/worker/src/sla.ts"],
      ["REVIEW", "apps/api/src/events.ts"],
    ],
  );
  assert.match(e[0].reason, /formatDuration\(seconds\) @unit seconds/);
  assert.match(e[1].reason, /hidden link/);
});

test("duration PR: shortlist names sla.test.ts, which the PR never touched", () => {
  const tests = review("pr-duration-ms").drifts[0].entries.filter((x) => x.verdict === "TEST");
  const sla = tests.find((t) => t.path === "apps/worker/src/sla.test.ts");
  assert.ok(sla, `tests: ${tests.map((t) => t.path).join(", ")}`);
  assert.equal(sla.inDiff, false);
});

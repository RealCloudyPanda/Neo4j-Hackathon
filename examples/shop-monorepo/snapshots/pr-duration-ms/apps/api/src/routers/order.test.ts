import { expect, test } from "@shop/testkit";
import { toSummary } from "./order";

test("summary reports fulfilment time in milliseconds", () => {
  const s = toSummary({ id: "o1", status: "shipped", startedAt: 0, doneAt: 7000, grams: 1250, cents: 4999, placed: "2026-11-20" });
  expect(s.duration).toBe(7000);
});

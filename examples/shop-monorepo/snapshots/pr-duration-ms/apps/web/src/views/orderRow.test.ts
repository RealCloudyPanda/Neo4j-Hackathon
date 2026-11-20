import { expect, test } from "@shop/testkit";
import { orderRow } from "./orderRow";

test("order row shows how long fulfilment took", () => {
  const row = orderRow({ id: "o1", status: "shipped", duration: 7, weight: 1250, totalCents: 4999, placedAt: "2026-11-20" });
  expect(row.took).toBe("7s");
});

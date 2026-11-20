import { expect, test } from "@shop/testkit";
import { shippingLabel } from "./shippingLabel";

test("label prints the weight in kilograms", () => {
  const label = shippingLabel({ id: "o1", status: "packed", duration: 7, weight: 1250, totalCents: 4999, placedAt: "2026-11-20" });
  expect(label).toBe("o1 · placed 2026-11-20 · 1.3 kg");
});

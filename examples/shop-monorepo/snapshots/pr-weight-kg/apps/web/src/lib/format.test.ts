import { expect, test } from "@shop/testkit";
import { formatDuration, formatMoney, formatWeight } from "./format";

test("formats durations given in seconds", () => {
  expect(formatDuration(7)).toBe("7s");
  expect(formatDuration(7260)).toBe("2 h 1 min");
});

test("formats weight and money", () => {
  expect(formatWeight(1250)).toBe("1.3 kg");
  expect(formatMoney(4999)).toBe("$49.99");
});

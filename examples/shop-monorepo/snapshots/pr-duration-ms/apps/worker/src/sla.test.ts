import { expect, test } from "@shop/testkit";
import { parseJob } from "./queue";
import { isBreached } from "./sla";

test("a 7-second fulfilment is not an SLA breach", () => {
  const job = parseJob('{"orderId":"o1","durationSec":7}');
  expect(isBreached(job)).toBe(false);
});

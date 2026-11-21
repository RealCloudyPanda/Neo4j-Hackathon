import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "../src/relate/store.ts";
import { tagsFromText } from "../src/extract/fields.ts";
import { extractSnapshot } from "../src/extract/index.ts";

const snap = (id: string) => join(ROOT, "examples/shop-monorepo/snapshots", id);
const base = extractSnapshot(snap("base"), "base");
const head = extractSnapshot(snap("pr-duration-ms"), "pr-duration-ms");

test("files: package and test flags", () => {
  const sla = base.files.find((f) => f.path === "apps/worker/src/sla.test.ts");
  assert.ok(sla?.isTest);
  assert.equal(sla?.package, "apps/worker");
});

test("imports: worker test imports sla.ts; web test chain resolves through the alias", () => {
  assert.ok(base.imports.some((i) => i.from === "apps/worker/src/sla.test.ts" && i.to === "apps/worker/src/sla.ts"));
  assert.ok(base.imports.some((i) => i.from === "apps/web/src/views/orderRow.test.ts" && i.to === "apps/web/src/views/orderRow.ts"));
  assert.ok(base.imports.some((i) => i.from === "apps/web/src/views/orderRow.ts" && i.to === "packages/contracts/src/order.ts"));
});

test("fields: meaning tags per snapshot, worker field included", () => {
  const d = (s: typeof base) => s.fields.find((f) => f.key === "packages/contracts/src/order.ts#OrderSummary.duration");
  assert.equal(d(base)?.unit, "seconds");
  assert.equal(d(head)?.unit, "milliseconds");
  assert.equal(base.fields.find((f) => f.key === "apps/worker/src/queue.ts#SlaJob.durationSec")?.unit, "seconds");
  assert.equal(base.fields.find((f) => f.key === "packages/contracts/src/order.ts#OrderSummary.placedAt")?.format, "iso-date");
  assert.ok(base.fields.some((f) => f.key === "packages/contracts/src/order.ts#OrderSummary.id"), "untagged counterparts survive so tag removal is detectable");
});

test("usages: orderRow passes to formatDuration(seconds); events.ts has no param", () => {
  const row = base.usages.find((u) => u.key === "packages/contracts/src/order.ts#OrderSummary.duration" && u.path === "apps/web/src/views/orderRow.ts");
  assert.equal(row?.passesTo?.fn.name, "formatDuration");
  assert.equal(row?.passesTo?.param.unit, "seconds");
  const ev = base.usages.find((u) => u.key === "packages/contracts/src/order.ts#OrderSummary.duration" && u.path === "apps/api/src/events.ts");
  assert.ok(ev);
  assert.equal(ev.passesTo, undefined);
});

test("producers: toSummary writes duration", () => {
  const p = base.producers.find((x) => x.key === "packages/contracts/src/order.ts#OrderSummary.duration" && x.path === "apps/api/src/routers/order.ts");
  assert.equal(p?.name, "order.summary");
});

test("parameter tags preserve IANA time zones and positive offsets", () => {
  assert.deepEqual(tagsFromText("/** @tz America/Toronto */"), { tz: "America/Toronto" });
  assert.deepEqual(tagsFromText("/** @tz Etc/GMT+5*/"), { tz: "Etc/GMT+5" });
});

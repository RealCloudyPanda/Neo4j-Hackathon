import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import test from "node:test";
import { createApp } from "../src/viewer/server.ts";

test("viewer routes expose the committed duration review and its evidence", async () => {
  const { app, storeError } = createApp();
  assert.equal(storeError, null);

  async function get(url: string) {
    const req = new IncomingMessage(new Socket());
    req.url = url;
    req.method = "GET";
    const res = new ServerResponse(req);
    const body = await new Promise<string>((resolve) => {
      res.end = ((data: Buffer) => {
        resolve(data.toString());
        return res;
      }) as typeof res.end;
      app(req, res);
    });
    assert.equal(res.statusCode, 200, body);
    return JSON.parse(body);
  }

  const { reviews } = await get("/api/reviews");
  const review = reviews.find((item: { head: string }) => item.head === "pr-duration-ms");
  assert.ok(review);
  const { drift, elements, highlight } = await get(`/api/drift/${encodeURIComponent(review.drifts[0].id)}`);
  const worker = drift.entries.find((entry: { path: string }) => entry.path === "apps/worker/src/sla.ts");
  assert.equal(worker?.verdict, "MISMATCH");
  const hiddenLink = elements.find((el: { data: { type: string } }) => el.data.type === "LINKED_TO");
  assert.ok(hiddenLink);
  assert.ok(highlight[worker.targetId].includes(hiddenLink.data.id));

  const params = new URLSearchParams({ snapshot: review.head, path: worker.path, line: String(worker.line) });
  const evidence = await get(`/api/snippet?${params}`);
  assert.match(evidence.lines[worker.line - evidence.from], /job\.durationSec/);
  assert.equal((await get("/api/store")).readOnly, true);
});

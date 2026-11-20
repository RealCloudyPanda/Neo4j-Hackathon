import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../src/relate/store.ts";

test("in-memory store: create, MERGE and a variable-length path", () => {
  const s = openStore(":memory:");
  s.query("UNWIND $rows AS r MERGE (n:N {id: r.id})", { rows: [{ id: "a" }, { id: "b" }, { id: "c" }] });
  s.query("MATCH (a:N {id:'a'}), (b:N {id:'b'}) MERGE (a)-[:R]->(b)");
  s.query("MATCH (b:N {id:'b'}), (c:N {id:'c'}) MERGE (b)-[:R]->(c)");
  const rows = s.query<{ ids: string[]; len: number }>(
    "MATCH p = (:N {id:'a'})-[:R*1..3]->(:N {id:'c'}) RETURN [n IN nodes(p) | n.id] AS ids, length(p) AS len",
  );
  assert.deepEqual(rows, [{ ids: ["a", "b", "c"], len: 2 }]);
});

test("tx rolls back on throw", () => {
  const s = openStore(":memory:");
  assert.throws(() =>
    s.tx(() => {
      s.query("CREATE (:T {id: 1})");
      throw new Error("boom");
    }),
  );
  assert.equal(s.query<{ c: number }>("MATCH (t:T) RETURN count(t) AS c")[0].c, 0);
});

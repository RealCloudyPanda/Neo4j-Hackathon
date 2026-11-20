import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../src/relate/store.ts";
import { applySchema } from "../src/graph/schema.ts";
import { loadSnapshot } from "../src/graph/load.ts";
import { snapshot } from "./helpers.ts";

test("loading a snapshot: label counts match the extractor output", () => {
  const store = openStore(":memory:");
  applySchema(store);
  const s = snapshot("base");
  loadSnapshot(store, s);
  const count = (q: string) => Number(store.query<{ c: number }>(q)[0].c);
  assert.equal(count("MATCH (:Snapshot {id:'base'})-[:CONTAINS]->(f) RETURN count(f) AS c"), s.files.length);
  assert.equal(count("MATCH (v:FieldVersion) RETURN count(v) AS c"), s.fields.length);
  assert.equal(count("MATCH (u:Usage) RETURN count(u) AS c"), s.usages.length);
  assert.equal(count("MATCH (p:Producer) RETURN count(p) AS c"), s.producers.length);
  assert.equal(count("MATCH ()-[i:IMPORTS]->() RETURN count(i) AS c"), s.imports.length);
  assert.equal(count("MATCH ()-[l:LINKED_TO {source:'manifest'}]->() RETURN count(l) AS c"), 1);
  assert.equal(count("MATCH (:Usage)-[:PASSES_TO]->(:Param {unit:'seconds'})-[:PARAM_OF]->(:Function {name:'formatDuration'}) RETURN count(*) AS c"), 1);
});

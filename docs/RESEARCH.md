# Research notes

Date: 2026-11-20. Everything under "Verified" was run on this machine (macOS arm64, Node 22.17.1)
in a throwaway scratch folder, not in this repo.

## 1. Relate spike (risk first)

### Verified working API (`@relate/relate` 1.1.0)

```js
const { Database } = require("@relate/relate");   // CJS
import { Database } from "@relate/relate";          // ESM also works (named + default import)

const db = Database.open("./data/contract-drift.rl");          // single-file store, created if missing
const ro = Database.open("./data/contract-drift.rl", { readOnly: true });
const conn = db.connect();                                       // namespace "neo4j" by default
const r = conn.query("MATCH (n) RETURN count(n) AS n", params); // sync
r.rows; r.single(); r.stats; r.columns; r.graph();              // graph() = de-duplicated nodes + rels
await conn.queryAsync(cypher, params);
conn.begin(); conn.query(...); conn.commit();  // or conn.rollback()
db.checkpoint();                                // flush snapshot
```

- Package ships `index.d.ts` (full TS types) and an agent skill at
  `node_modules/@relate/relate/.agents/skills/relate/SKILL.md`.
- Native lib comes from an optional platform package (`@relate/relate-darwin-arm64`, linux x64/arm64,
  win32 x64, darwin x64). No install scripts, no Rust toolchain.
- Node values come back as `{kind:"node", elementId, id, labels, properties}`; relationships as
  `{kind:"relationship", type, startElementId, endElementId, properties}`; paths as alternating arrays.
  This maps 1:1 onto Cytoscape.js elements.

### Spike script result

Opened `spike.rl`, `UNWIND $rows ... MERGE` created ContractField → Consumer → Test (5 nodes, 4 rels),
exited the process, reopened read-only in a **new process**, and ran:

```cypher
MATCH p=(t:Test)-[*1..3]->(f:ContractField {id:$f})
RETURN [n IN nodes(p) | n.id] AS chain, length(p) AS len
```

→ `["web/formatDuration.test.ts","web/formatDuration.ts","Order.duration"]`, len 2 (and the worker chain).

Cypher features confirmed working: `UNWIND $rows`, `MERGE` (nodes and rels), `SET`, parameters,
variable-length `[*1..3]`, unbounded `[:R*]`, quantified `-[:R]->{1,3}`, `shortestPath`,
`nodes(p)`, list comprehensions, `reduce`, `CASE`, `collect(DISTINCT …)`, map projection `f{.*}`,
`OPTIONAL MATCH`, `EXISTS { }` subquery, `CALL { WITH … }` subquery, `STARTS WITH`, `CALL db.labels()`,
`CREATE INDEX … IF NOT EXISTS`, `CREATE CONSTRAINT … REQUIRE … IS UNIQUE` (enforced),
`MATCH (n) DETACH DELETE n`, explicit transactions.
Not available: APOC (`apoc.*` → UnknownFunction). Do string work in JS.

### Gotchas (all observed, design around them)

1. **No `Database.close()` in the JS API.** A second open of the same store *in the same process*
   (writable or read-only) fails with an opaque `internal error`. Open each store once per process and
   keep the handle (module-level singleton).
2. **Single writer across processes.** While one process holds the store writable, another process
   cannot open it at all (even read-only → `internal error`). So the viewer cannot run while the
   builder writes. Design: `build` (writer) runs and exits; `viewer` opens read-only afterwards.
   Multiple read-only handles in one process are fine.
3. **Errors are often opaque** (`Neo.DatabaseError.General.UnknownError`, `internal error`, stage
   `internal`) for lock/IO problems. Wrap `Database.open` and print a human hint
   ("is the viewer still running? stop it, then rebuild").
4. **`.rl` is not byte-deterministic.** Two identical builds produce different bytes. Never rebuild the
   committed store implicitly; store a content fingerprint in a `:Meta` node and skip the rebuild when
   sources are unchanged, so `git status` stays clean after a judge runs the demo.
5. **Writes persist without `checkpoint()`** (WAL inside the file), but call `checkpoint()` at the end of
   a build anyway so the snapshot is compact.
6. **Rebuild = delete the file and recreate.** `DETACH DELETE` works but ids keep growing.
7. **Index then constraint on the same property conflicts** (`AlreadyExists`). Use only
   `CREATE CONSTRAINT … IS UNIQUE` (it brings its own index).
8. Integers come back as `number` (or `bigint` past 2^53). Line numbers are safe as numbers.

### Store-mode comparison (decided in ADR 0001)

| Mode | Clone-and-open works? | Human-readable in GitHub? | Notes |
| --- | --- | --- | --- |
| Single file `.rl` | **Yes**: a plain copy of the file opens read-only in a new process | No (binary container `MDBCLB01`, WAL records inside are JSON lines) | No side files, no lock files |
| Directory, JSON codec (`RELATE_SNAPSHOT_FORMAT=json` before first open, or pre-seed `manifest.json` with `{"codec":"json"}`) | **Only if the lock files are committed too**: a copy without `.cypherlite.lock`, `.cypherlite.writer`, `wal/.cypherlite.*` fails to open, read-only *and* writable | Yes: `graph.json` is the full graph, byte-identical across identical builds | Fragile under `.gitignore` habits |
| Directory, Parquet (default) | Same lock-file issue | No | |
| `:memory:` | n/a | n/a | Used in unit tests |

### Other Relate surfaces (from docs, not spiked)

- CLI: `curl -sSfL https://relatedb.ai/install.sh | bash`, then
  `relate --database ./data/contract-drift.rl --read-only "MATCH (n) RETURN count(n)"`.
  Mention in README as an *optional* second way to inspect the store; the repo must not need it.
- WASM: `@relate/relate-wasm`, `RelateDb.execute(stmt, paramsJson)` returns a JSON envelope.
  **Cannot open a `.rl` file in the browser** (OPFS stores only, needs a dedicated worker).
  So an in-browser viewer would have to re-ingest the graph. Not worth it: the viewer is an Express
  server over the committed `.rl`.
- Vector and full-text search exist (`guides/cypher/vector-search.md`). Not needed here.
- `relate serve --bolt 7687` works with stock `neo4j-driver`. Not needed.
- Known limits: single process per store, whole graph in RAM, explicit var-length bound max 500 hops
  (unbounded `*` stops at 32). Our paths are under 6 hops.

## 2. ts-morph spike (consumer extraction)

Verified with `ts-morph` 28.0.0 on a 3-file mini fixture (contracts / api / web):

- `iface.getPropertyOrThrow("duration").getJsDocs()[0].getTags()` → `[["unit","seconds"]]`.
  JSDoc custom tags are parsed for free.
- `prop.findReferencesAsNodes()` found **all three** real usages, including through an *inferred* type
  (no annotation at the call site):
  - `api/router.ts:3` PropertyAssignment (the producer writing the field)
  - `web/row.ts:5` PropertyAccessExpression inside `formatDuration(data.duration)`
  - `web/row.ts:6` BindingElement (`const { duration } = summary()`)
- So: classify each reference by parent kind: PropertyAssignment / ShorthandPropertyAssignment →
  **write** (producer); PropertyAccessExpression / BindingElement / ElementAccess → **read** (usage).
- For "value flows into a function parameter": if the read is a direct argument of a CallExpression
  (`call.getArguments().includes(node)`), resolve the callee declaration
  (`call.getExpression().getSymbol()?.getDeclarations()`) and read the parameter's `@unit` tag.
  Gotcha: `getFirstAncestorByKind(CallExpression)` is too loose (it caught the outer
  `t.procedure.query(...)`); check direct-argument position instead.
- One `Project` with all monorepo files (`addSourceFilesAtPaths`) + a `paths` mapping for
  `@shop/contracts` is enough; no tsconfig per package needed.
- Cost: `findReferences` is slow-ish per call; we only call it for annotated contract fields (< 20).

What static analysis **cannot** see in the fixture (so the manifest exists): the worker receives the
order as a JSON queue message typed with its *own* local interface (`SlaJob`). No import connects it
to `OrderSummary`. `contract-drift.links.json` declares `SlaJob.durationSec ← OrderSummary.duration
(via queue "orders.completed")`, and the graph stores that edge with `source: "manifest"`.

## 3. Prior art and how we differ

| Tool | What it does | Gap we fill |
| --- | --- | --- |
| oasdiff (★1.5k), Optic (★1.5k), Azure/openapi-diff | Diff two OpenAPI specs, flag breaking *structural* changes | Unit/meaning changes with the same type are invisible; no link to the code that consumes the field |
| graphql-inspector (★1.8k), buf breaking (★11k) | Schema-level breaking-change checks for GraphQL / protobuf | Same: schema only, no consumer code, no tests |
| Pact (★1.8k) | Consumer-driven contract tests between services | Needs a test per consumer written up front and a broker; does not find consumers for you |
| dependency-cruiser (★7.4k), Nx affected (★29k) | File/module dependency graphs, "affected projects" | File-level, not field-level: flags everything that imports the contracts package |
| TypeScript itself / tRPC | Type-safe end to end | `number` stays `number` when seconds become milliseconds: exactly the hole |
| Several small GitHub repos named "contract drift" | Runtime traffic vs OpenAPI | Runtime, not PR-time; no graph of consumers/tests |

Our angle: **field-level meaning metadata + a persisted graph of producers, usages, functions, tests and
hidden links, queried with variable-length paths to give a reviewer a ranked shortlist with file:line
evidence, including tests the PR did not touch.**

## 4. Reusable bits

- `ts-morph` (MIT): AST + language service, used as shown above.
- `cytoscape` 3.35 (MIT): graph rendering in the viewer, served from `node_modules` (no CDN).
- `tsx` 4.x: run TypeScript CLIs without a build step.
- `node:test` + `node:assert`: test runner, no extra dependency.
- Relate's own skill file (`node_modules/@relate/relate/.agents/skills/relate/SKILL.md`) for API detail.

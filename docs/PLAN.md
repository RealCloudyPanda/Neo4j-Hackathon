# Build plan

Read first: `docs/SPEC.md` (what), `docs/RESEARCH.md` (Relate gotchas: no `close()`, one writer per
store, `.rl` not byte-deterministic, constraint-not-index), `GLOSSARY.md` (names in code must match).
One task = one commit (conventional message). Run the acceptance check before committing. Do not push.
No AI attribution in commits. Use `:memory:` stores in unit tests; only task 13 writes `data/contract-drift.rl`.

Stack: Node 22, TypeScript run via `tsx` (no build step for CLI), `ts-morph`, `@relate/relate`, Express,
Cytoscape, `node:test`. Layout:

```
src/
  relate/store.ts        open once (writable | readOnly), run(), loadQuery(name), friendly errors
  extract/               ts-morph: project.ts, fields.ts, usages.ts, imports.ts, links.ts, files.ts
  graph/                 schema.ts (constraints), load.ts (UNWIND batches per label/rel)
  review/                drift.ts, impact.ts, tests.ts, rank.ts, save.ts
  cli/                   index.ts (bin), analyze.ts, build.ts, cypher.ts, format/{text,json,markdown}.ts
  viewer/                server.ts, public/{index.html, app.js, styles.css}
queries/                 drift.cypher, impact.cypher, tests.cypher, presets/*.cypher
data/contract-drift.rl   committed store
examples/shop-monorepo/  fixture
test/                    *.test.ts
```

## Tasks

1. **chore: scaffold package** — `package.json` (name `contract-drift`, `type: module`, `bin`,
   scripts `analyze`, `build:graph`, `cypher`, `viewer`, `demo`, `test`, `typecheck`), `tsconfig.json`
   (strict, NodeNext), deps `@relate/relate ts-morph express cytoscape`, dev deps `tsx typescript
   @types/node @types/express`. `src/cli/index.ts` prints help.
   ✔ `npm install && npx tsx src/cli/index.ts --help` prints usage; `npm run typecheck` passes.

2. **feat: Relate store wrapper** — `src/relate/store.ts`: `openStore(path, {readOnly})` caches one handle
   per path per process (no `close()` exists), `query<T>(cypher, params)`, `loadQuery(name)` from
   `queries/`, error wrapper that adds a hint for `internal error` on open ("another process may hold the
   store; stop the viewer"). `test/store.test.ts` on `:memory:`: create, MERGE, var-length path.
   ✔ `npm test` green.

3. **feat: base snapshot of the fixture** — `examples/shop-monorepo/snapshots/base/` exactly as SPEC §6
   (contracts, testkit, api trpc stub + router + events, web lib/views + tests, worker queue/sla + test,
   tsconfig, links manifest). Code realistic and short.
   ✔ `npx tsc -p examples/shop-monorepo/snapshots/base --noEmit` passes.

4. **feat: the two PR snapshots** — copy base to `pr-duration-ms` and `pr-weight-kg`, apply only the changes
   in SPEC §6; `examples/shop-monorepo/README.md` lists changed files and expected results.
   `test/fixture.test.ts` runs `tsc --noEmit` on all three.
   ✔ `diff -r base pr-duration-ms` shows only contracts, api router, api router test; same for weight; tests green.

5. **feat: extract files and imports** — `extract/project.ts` (one ts-morph Project per snapshot, path
   mapping from its tsconfig), `extract/files.ts` (path, package = `apps/x`/`packages/x`, `isTest`,
   sha1 hash), `extract/imports.ts` (resolved relative + alias imports → `{from,to,specifier}`).
   ✔ unit test: `apps/worker/src/sla.test.ts` imports `apps/worker/src/sla.ts`; web test chain resolved.

6. **feat: extract contract fields with meaning tags** — `extract/fields.ts`: every interface/type property
   with `@unit|@format|@tz` JSDoc → FieldVersion `{key, type, unit, format, tz, doc, path, line}`. Includes
   `SlaJob.durationSec` in the worker.
   ✔ unit test: base has `OrderSummary.duration` unit `seconds`; pr-duration-ms has `milliseconds`.

7. **feat: extract producers, usages and parameter flow** — `extract/usages.ts`: `findReferencesAsNodes()`
   per field; PropertyAssignment/Shorthand → Producer (name from enclosing `router({...})` key path, e.g.
   `order.summary`); PropertyAccess/BindingElement/ElementAccess → Usage with `code` = trimmed line; if the
   read node is a **direct** argument of a call (not `getFirstAncestorByKind`, RESEARCH §2), resolve callee
   → Function + Param with tags from `@param`-adjacent JSDoc or the parameter's own JSDoc.
   ✔ unit test: base `orderRow.ts` usage passes to `formatDuration` param `seconds` with unit `seconds`;
   `events.ts` usage has no param; producer `order.summary` found.

8. **feat: link manifest** — `extract/links.ts`: read optional `contract-drift.links.json`, validate shape,
   error with file + index on unknown field keys.
   ✔ unit test: valid file loads; a bad key gives a readable error.

9. **feat: load a snapshot into the graph** — `graph/schema.ts` (unique constraints on `id` per label, `key`
   on Field), `graph/load.ts` (`UNWIND $rows` batches per label and per rel type, one transaction per
   snapshot; Snapshot/File/IMPORTS/Field/FieldVersion/Producer/Usage/Function/Param/LINKED_TO).
   ✔ test on `:memory:`: label counts match extractor output; `MATCH (:Snapshot {id:'base'})-[:CONTAINS]->(f) RETURN count(f)` equals file count.

10. **feat: in-graph drift detection** — `queries/drift.cypher` (SPEC §3, dynamic `b[tag]`, verified),
    `review/drift.ts` creates `Drift` nodes + ON/BEFORE/AFTER; sets `File.inDiff` for head by hash compare in
    Cypher (`MATCH` same path across snapshots, `<>` hash, or missing in base).
    ✔ test: base..pr-duration-ms → exactly one drift `unit seconds→milliseconds`; base..base → zero.

11. **feat: impact paths and verdicts** — `queries/impact.cypher` (`LINKED_TO*0..2` then `READ_AT`),
    `review/impact.ts` + `review/rank.ts` implementing the SPEC §3 verdict and rank rules; `pathText` built
    from relationship types.
    ✔ test: duration PR → MISMATCH orderRow.ts (via formatDuration), MISMATCH sla.ts (hidden link),
    REVIEW events.ts, in that order.

12. **feat: tests reachable through imports** — `queries/tests.cypher` (`IMPORTS*1..3`), `review/tests.ts`,
    `review/save.ts` writes `(:Drift)-[:FLAGS {rank, verdict, reason, hops, pathText}]->`.
    ✔ **positive test** (`test/review.positive.test.ts`): shortlist contains `apps/worker/src/sla.test.ts`
    with `inDiff=false`; **negative test** (`test/review.negative.test.ts`): base..pr-weight-kg flags
    `shippingLabel.ts`, and no flagged path starts with `apps/worker/`.

13. **feat: build:graph command and the committed store** — `cli/build.ts`: fingerprint = sha1 of all
    fixture file hashes + tool version; if `:Meta.fingerprint` matches → "store up to date", exit 0 without
    opening writable; else delete file, open writable, load all snapshots, run drift+impact+tests+save for
    each head vs base, `checkpoint()`, exit. Commit `data/contract-drift.rl`.
    ✔ `npm run build:graph` twice: second run prints "up to date" and `git status` is clean;
    `npm run build:graph -- --force` rebuilds.

14. **feat: analyze command with text output** — `cli/analyze.ts` reads the committed store read-only (falls
    back to an in-memory build when `--base/--head` are folders not in the store), `format/text.ts` as in
    SPEC §4 (colour via `node:util` `styleText`, `--no-color`), exit codes 0/1/2.
    ✔ `npm run analyze` prints the duration shortlist and exits 1; `--head pr-weight-kg` shows no worker
    line; `--head base` prints "No meaning changes" and exits 0.

15. **feat: JSON and Markdown output** — `format/json.ts` (stable schema, includes `cypher` used),
    `format/markdown.ts` (PR-comment table with `<details>` paths). `test/cli.test.ts` snapshot-tests the
    text output of the duration PR (via `node:test` snapshot or a committed `.txt`).
    ✔ `npm run analyze -- --markdown` renders in a GitHub preview; tests green.

16. **feat: read-only cypher command** — `cli/cypher.ts`: refuses write clauses (regex on
    CREATE|MERGE|SET|DELETE|REMOVE|DROP|LOAD outside strings), prints aligned table, nodes as
    `(:Label id)`; `queries/presets/*.cypher` (drifts, impact-paths, tests-not-in-diff, hidden-links,
    head-graph) runnable with `npm run cypher -- --preset tests-not-in-diff`.
    ✔ preset prints `apps/worker/src/sla.test.ts`; `npm run cypher -- "CREATE (n)"` exits 2 with a message.

17. **feat: viewer server and API** — `viewer/server.ts`: Express on 4317, read-only store opened once,
    routes from SPEC §5, cypher route uses the same guard + 500-row cap + 2 s timeout, snippet route reads
    only inside `examples/` (path traversal guard).
    ✔ `curl localhost:4317/api/reviews` lists 2 reviews; `/api/drift/<id>` returns shortlist + elements.

18. **feat: viewer review screen** — `public/index.html`, `app.js`, `styles.css`: left rail, Cytoscape graph
    (styles by label/verdict, dashed hidden links, `breadthfirst` layout rooted at Drift), shortlist cards
    with snippets, hover ⇄ path highlight, `j/k`. Fonts via `@fontsource/ibm-plex-sans` + `-mono` served
    from node_modules. Apply the design refs (impeccable shape→critique→polish, Emil easing, better-ui).
    ✔ manual: all four duration-PR entries visible; hovering the worker card highlights the dashed link path.

19. **feat: viewer Cypher and Store tabs** — console with presets, table + "as graph" toggle, error display
    with Relate error code; Store tab with path, size, counts, fingerprint, Relate CLI command.
    ✔ manual: preset "Tests not in diff" shows sla.test.ts; Store counts equal `npm run cypher` counts.

20. **feat: demo script and empty/error states** — `npm run demo` (build:graph → analyze → viewer, prints
    URL), viewer empty state for no drifts, friendly page when store missing ("run npm run build:graph").
    ✔ fresh clone in `/tmp`-style scratch folder: `npm install && npm run demo` works, `git status` clean.

21. **test: end-to-end on the committed store** — `test/store.committed.test.ts` opens
    `data/contract-drift.rl` read-only in a child process and asserts the saved FLAGS match the expected
    positive/negative results (guards against stale committed store); `npm test` runs everything.
    ✔ `npm test` green; changing a fixture file without rebuilding makes this test fail with a hint.

22. **docs: README in the hackathon template** — Project name + pitch; Use case; How it uses Relate (Mode:
    single file; Why this mode; What the graph models, with a Mermaid diagram and the three queries);
    Setup and run (exact commands, real pasted output); Where the data lives (table: `data/contract-drift.rl`,
    `queries/`, fixture); plus Sample data note (fixture only, no keys), Judging criteria → proof table,
    Project structure, Known limitations, How this was built (AI disclosure), License.
    ✔ every command in README run verbatim from a fresh clone.

23. **docs: screenshots** — headless Chrome or Playwright captures of Review (duration PR, worker card
    hovered), Review (weight PR, worker absent), Cypher tab, Store tab, plus terminal output as an image
    (or code block) → `docs/images/*.png`; embed in README.
    ✔ 4+ PNGs exist and render in README preview.

24. **chore: submission polish** — `package.json` `repository`, `keywords`, `engines`; `npm pkg` bin works via
    `npx contract-drift --help` from repo; final `npm test`; record fresh-clone timing; checklist in SPEC
    §10 ticked except push/topics/video (coordinator).
    ✔ `npx contract-drift analyze` works from the repo root.

Stretch (only if all above are done): `@format` / `@tz` fixture case (third PR snapshot); `--since` mode
reading two git refs into temp folders; GitHub Action example YAML posting `--markdown`.

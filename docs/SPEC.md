# Contract Drift: spec

> Catch the PR that passes TypeScript but changes what an API field means.

Hackathon: Relate by Neo4j (deadline 2026-12-11 21:00 ET). Flagship entry.
Terms follow `GLOSSARY.md`. Decisions are in `docs/GRILL.md` and `docs/adr/`.

## 1. User and problem

**Reviewer** on a TypeScript monorepo (tRPC API, web app, background worker). A PR changes
`OrderSummary.duration` from seconds to milliseconds. It is still a `number`; `tsc` is green; the web
formatter and a worker that gets the value through a queue still assume seconds. Grep finds hundreds of
`duration`s. The reviewer approves; production shows "2 hours" for a 7-second job and the SLA worker pages
on-call.

Contract Drift gives the reviewer, in one command, a ranked **shortlist** of every usage and test the
**meaning change** reaches, with file:line **evidence** and the **impact path**, including tests the PR
never touched. It stays quiet for unrelated changes.

What it does **not** do: guess meaning (only explicit `@unit` / `@format` / `@tz` tags, ADR 0002), read git,
call an LLM, or need any account or key.

## 2. Flows

### F1. CLI review (the core)
1. `npm install` (one time).
2. `npm run analyze` → analyzes the fixture PR `pr-duration-ms` against `base` using the committed store.
3. Output: drift header, shortlist, tests, "not affected" summary, the Cypher used. Exit code 1 (MISMATCH found).
4. `npm run analyze -- --head pr-weight-kg` → negative case: worker not listed.
5. `npm run analyze -- --head base` → "No meaning changes between base and base." Exit 0.

### F2. Rebuild the graph from source
1. `npm run build:graph` → parses all snapshots with ts-morph, writes `data/contract-drift.rl`,
   runs the drift + impact queries for every head vs base, saves Drift/FLAGS, checkpoints, exits.
2. Skips work when the fixture fingerprint matches the `:Meta` node (prints "store up to date"); `--force`
   rebuilds.

### F3. Explore in the viewer
1. `npm run viewer` → http://localhost:4317 (opens the store read-only).
2. Pick a PR → see its drifts → click a drift → impacted subgraph + shortlist.
3. Hover a shortlist row → its impact path lights up in the graph; code snippet shows the evidence line.
4. "Cypher" tab: read-only console with preset queries; results as table and as graph.
5. "Store" tab: file path, size, label and relationship counts, build fingerprint.

### F4. Judge one-liner
`npm install && npm run demo` = `build:graph` (no-op on a fresh clone) + `analyze` + `viewer`.

### F5. Use on another repo (documented, untested beyond fixture)
`npm run analyze -- --base ./old-checkout --head ./new-checkout --store ./review.rl`
(two folders, a new store path, and an optional `contract-drift.links.json` in the head folder).

## 3. Graph model (Relate, single file `data/contract-drift.rl`)

Every snapshot-scoped node has `snapshot` and an `id` of the form `<snapshot>:<path>[:line[:col]]`.
Uniqueness constraints on `id` for every label below (one `CREATE CONSTRAINT … IS UNIQUE` each, no separate
index: see RESEARCH gotcha 7).

### Node labels

| Label | Key properties | Meaning |
| --- | --- | --- |
| `Meta` | `key:"build"`, `fingerprint`, `toolVersion`, `snapshots` | Build bookkeeping |
| `Snapshot` | `id` (`base`, `pr-duration-ms`, `pr-weight-kg`), `title`, `fileCount` | One monorepo copy |
| `File` | `id`, `snapshot`, `path`, `package`, `isTest`, `hash`, `inDiff` (head snapshots only, vs base) | Source file |
| `Field` | `key` (`OrderSummary.duration`) | Snapshot-independent identity of a contract field |
| `FieldVersion` | `id`, `snapshot`, `key`, `type`, `unit`, `format`, `tz`, `doc`, `path`, `line` | A contract field as declared in one snapshot |
| `Producer` | `id`, `snapshot`, `name` (`order.summary`), `path`, `line`, `code` | Code that writes the field |
| `Usage` | `id`, `snapshot`, `path`, `line`, `col`, `kind` (`read`/`destructure`), `code` | One read of a field |
| `Function` | `id`, `snapshot`, `name`, `path`, `line` | A function whose parameter receives a field value |
| `Param` | `id`, `snapshot`, `name`, `index`, `unit`, `format`, `tz`, `path`, `line` | A tagged (or untagged) parameter |
| `Drift` | `id` (`base..pr-duration-ms:OrderSummary.duration:unit`), `base`, `head`, `key`, `tag`, `before`, `after` | One meaning change |

### Relationship types

| Pattern | Properties | Source |
| --- | --- | --- |
| `(Snapshot)-[:CONTAINS]->(File)` | | fs walk |
| `(File)-[:IMPORTS]->(File)` | `specifier` | ts-morph import declarations, resolved |
| `(Field)<-[:VERSION_OF]-(FieldVersion)-[:DECLARED_IN]->(File)` | | ts-morph JSDoc |
| `(Producer)-[:WRITES]->(FieldVersion)`, `(Producer)-[:IN_FILE]->(File)` | | refs with PropertyAssignment parent |
| `(FieldVersion)-[:READ_AT]->(Usage)-[:IN_FILE]->(File)` | | refs with access/destructure parent |
| `(Usage)-[:PASSES_TO]->(Param)-[:PARAM_OF]->(Function)-[:IN_FILE]->(File)` | `argIndex` | direct call argument, callee resolved |
| `(FieldVersion)-[:LINKED_TO]->(FieldVersion)` | `source:"manifest"`, `via`, `reason` | `contract-drift.links.json` |
| `(Drift)-[:ON]->(Field)`, `(Drift)-[:BEFORE]->(FieldVersion)`, `(Drift)-[:AFTER]->(FieldVersion)` | | drift query |
| `(Drift)-[:FLAGS]->(Usage \| File)` | `rank`, `verdict` (`MISMATCH`/`REVIEW`/`OK`/`TEST`), `reason`, `hops`, `pathText` | impact query |

### The queries (live in `queries/*.cypher`, loaded by the code, shown in the viewer)

`drift.cypher`, the diff happens in the graph (ADR 0003):
```cypher
MATCH (f:Field)<-[:VERSION_OF]-(b:FieldVersion {snapshot:$base})
MATCH (f)<-[:VERSION_OF]-(h:FieldVersion {snapshot:$head})
UNWIND ['unit','format','tz'] AS tag
WITH f, b, h, tag, b[tag] AS before, h[tag] AS after
WHERE before IS NOT NULL AND after IS NOT NULL AND before <> after
RETURN f.key AS key, tag, before, after, b.id AS baseId, h.id AS headId
```
(Verified in Relate 1.1.0: dynamic property access `b[tag]` with `UNWIND` returns the expected row.)

`impact.cypher`, variable-length reach across code edges and hidden links:
```cypher
MATCH (h:FieldVersion {id:$headId})
MATCH p = (h)-[:LINKED_TO*0..2]->(:FieldVersion)-[:READ_AT]->(u:Usage)
OPTIONAL MATCH (u)-[:PASSES_TO]->(pm:Param)-[:PARAM_OF]->(fn:Function)
RETURN u, pm, fn, length(p) AS hops, [r IN relationships(p) | r] AS rels
```
(Verified: `-[:LINKED_TO*0..2]->` zero-length and multi-hop both match in Relate 1.1.0.)

`tests.cypher`, tests that import (transitively) a file holding a flagged usage or tagged function:
```cypher
MATCH (d:Drift {id:$driftId})-[:FLAGS]->(x)
MATCH (x)-[:IN_FILE|PARAM_OF*1..2]->(target:File)
MATCH tp = (t:File {snapshot:$head, isTest:true})-[:IMPORTS*1..3]->(target)
WITH t, min(length(tp)) AS hops, collect(DISTINCT target.path) AS reaches
RETURN t.path AS path, t.inDiff AS inDiff, hops, reaches
ORDER BY inDiff, hops, path
```

### Verdict and rank rules
- Usage value passes to a `Param` whose tag equals the **before** value → **MISMATCH**.
- Usage reached only through a hidden link and the linked `FieldVersion` has the before value → **MISMATCH**
  (reason "declared seconds on SlaJob.durationSec, linked via queue orders.completed").
- Tag equals the **after** value → **OK** ("already updated").
- No tag anywhere on the path → **REVIEW**.
- Tests → **TEST**.
- Rank: MISMATCH, REVIEW, TEST (not in diff first), OK; then fewer hops; then path. Producers are shown in the
  header, not the shortlist.

## 4. CLI UX

Binary `contract-drift` (package `bin`), scripts `npm run analyze`, `npm run build:graph`, `npm run cypher`.

```
$ npm run analyze

Contract Drift  base → pr-duration-ms        store data/contract-drift.rl (read-only)

DRIFT  OrderSummary.duration   @unit seconds → milliseconds
       declared   packages/contracts/src/order.ts:9
       produced   order.summary  apps/api/src/routers/order.ts:14   (in diff)

Reviewer shortlist                                                    in diff
  1  MISMATCH  apps/web/src/views/orderRow.ts:12                       no
               formatDuration(order.duration)
               passes to formatDuration(seconds) @unit seconds  apps/web/src/lib/format.ts:4
               path  FieldVersion ─READ_AT→ Usage ─PASSES_TO→ Param
  2  MISMATCH  apps/worker/src/sla.ts:8                                no
               job.durationSec > SLA_LIMIT_SECONDS
               hidden link: OrderSummary.duration → SlaJob.durationSec (@unit seconds)
               via queue "orders.completed" (contract-drift.links.json)
  3  REVIEW    apps/api/src/events.ts:11                               no
               durationSec: summary.duration
               reads the field; no meaning tag on the way, check by hand
  4  TEST      apps/worker/src/sla.test.ts                             no   ← not in this PR
  5  TEST      apps/web/src/views/orderRow.test.ts                     no   ← not in this PR
  6  TEST      apps/web/src/lib/format.test.ts                         no   ← not in this PR

Not affected: 9 other usages of 5 contract fields.   2 MISMATCH · 1 REVIEW · 3 tests
Explore: npm run viewer   ·   Query: npm run cypher -- "MATCH (d:Drift)-[r:FLAGS]->(x) RETURN d.key, r.verdict, x.path"
```

Flags: `--base <snapshot|dir>` (default `base`), `--head <snapshot|dir>` (default `pr-duration-ms`),
`--store <file>`, `--json`, `--markdown` (PR-comment format), `--no-color`, `--show-cypher`.
Exit codes: 0 no MISMATCH, 1 MISMATCH found, 2 usage/store error (with a plain-English hint, e.g. "the
viewer may be holding the store; stop it and retry").
Numbers in the example above are illustrative; the real output is pasted into the README from a real run.

`npm run cypher -- "<query>"` opens the store read-only, prints an aligned table, refuses write clauses
(CREATE/MERGE/SET/DELETE/REMOVE/DROP) with a message.

## 5. Viewer

Express server (`src/viewer/server.ts`), static HTML/CSS/vanilla TS bundled with esbuild, or plain ES modules
served as-is; Cytoscape from `node_modules`. Port 4317. Read-only store handle opened once at start.

API: `GET /api/reviews` (snapshot pairs with drift counts), `GET /api/drift/:id` (drift, shortlist,
subgraph elements), `GET /api/snippet?file&line` (5 lines around, from the fixture), `POST /api/cypher`
(read-only guard, 2 s timeout via `queryAsync` race, row limit 500), `GET /api/store` (counts, size, path).

Screens (one page, tabs):
1. **Review**: left rail (PR picker with title + drift count; drift list with `seconds → milliseconds`
   chips); centre graph (Drift in vermillion, FieldVersions as ink rectangles, usages as dots coloured by
   verdict, tests as squares, hidden links dashed with the `via` label); right shortlist (cards: verdict,
   file:line, code line with the field highlighted, reason, "not in diff" badge). Hover card ⇄ highlight path.
2. **Cypher**: textarea (monospace), preset buttons (Drifts, Impact paths, Tests not in diff, Hidden links,
   Whole head graph), result table + "show as graph" toggle. Errors shown with Relate's error code.
3. **Store**: "Where the data lives": path, size, mode = single file, label/rel counts table, build
   fingerprint, the exact Relate CLI command to open it read-only.
Empty state for `base..base`: "No meaning changes. Nothing to review." Keyboard: `j/k` move through
shortlist, `/` focus Cypher. Visual direction: "review desk" (warm paper `#f6f3ec`, ink `#1d1b17`,
vermillion `#d2401f` for drift/MISMATCH, amber for REVIEW, slate for context; IBM Plex Sans + Mono from
`@fontsource`; 4/8 spacing; focus rings visible; motion only on path highlight, 150 ms ease-out).

## 6. Fixture: `examples/shop-monorepo/`

```
examples/shop-monorepo/
  README.md                         what each snapshot changes, expected results
  snapshots/
    base/
      tsconfig.json                 strict, paths: @shop/contracts, @shop/testkit
      contract-drift.links.json     hidden links
      packages/contracts/src/order.ts      OrderSummary: id, status, duration @unit seconds,
                                           weight @unit grams, totalCents @unit cents, placedAt @format iso-date
      packages/testkit/src/index.ts        tiny expect() so tests type-check with no deps
      apps/api/src/trpc.ts                 minimal t.procedure / router stub (tRPC-shaped)
      apps/api/src/routers/order.ts        order.summary producer
      apps/api/src/routers/order.test.ts
      apps/api/src/events.ts               publishes {orderId, durationSec: summary.duration} as JSON to "orders.completed"
      apps/web/src/lib/format.ts           formatDuration(@unit seconds), formatWeight(@unit grams), formatMoney(@unit cents)
      apps/web/src/lib/format.test.ts
      apps/web/src/views/orderRow.ts       formatDuration(order.duration), formatMoney(order.totalCents)
      apps/web/src/views/orderRow.test.ts
      apps/web/src/views/shippingLabel.ts  formatWeight(order.weight)
      apps/web/src/views/shippingLabel.test.ts
      apps/worker/src/queue.ts             interface SlaJob { orderId; /** @unit seconds */ durationSec }, parseJob(JSON)
      apps/worker/src/sla.ts               isBreached(job): job.durationSec > SLA_LIMIT_SECONDS
      apps/worker/src/sla.test.ts
    pr-duration-ms/   = base + contracts duration @unit milliseconds, producer computes ms, order.test.ts updated
    pr-weight-kg/     = base + contracts weight @unit kilograms, producer divides by 1000, order.test.ts updated
```
`contract-drift.links.json`:
```json
{ "links": [ { "from": "OrderSummary.duration", "to": "SlaJob.durationSec",
  "via": "queue orders.completed",
  "reason": "apps/api/src/events.ts serialises the summary to JSON; the worker parses it with its own type" } ] }
```
Expected results (become test assertions):
- `base..pr-duration-ms`: 1 drift; MISMATCH orderRow.ts (via formatDuration) and sla.ts (via hidden link);
  REVIEW events.ts; tests include `apps/worker/src/sla.test.ts` with `inDiff=false`.
- `base..pr-weight-kg`: 1 drift; MISMATCH shippingLabel.ts; **no node under `apps/worker/` flagged**;
  `sla.test.ts` absent.
- `base..base`: 0 drifts.
- All three snapshots pass `tsc --noEmit`.

## 7. Judge scorecard (criterion → proof, highest weight first)

| Criterion (weight) | Proof we will show |
| --- | --- |
| Relate & connected context (30) | Committed `data/contract-drift.rl`; drift detected by a Cypher query over two snapshots in one graph; impact via variable-length paths mixing code edges and manifest hidden links; findings persisted as `(:Drift)-[:FLAGS]->`; read-only Cypher console + `npm run cypher` + `queries/*.cypher`; README "How it uses Relate" with exact queries; store opens on a fresh clone with no rebuild |
| Functionality & completeness (25) | One-command demo; CLI with JSON/Markdown/exit codes; viewer with 3 tabs; tests: positive, negative, no-drift, fixture type-checks, store opens read-only, CLI snapshot |
| Usefulness (20) | Real failure mode TypeScript cannot catch; shortlist names a test outside the diff; quiet on unrelated change; `--markdown` output ready for a PR comment; works on any two folders |
| Documentation & reproducibility (15) | README in their template; Quickstart verified from a fresh clone; screenshots; GLOSSARY, ADRs, SPEC; "Where the data lives" table; Known limitations |
| Creativity (10) | "Same type, new meaning" is a gap no schema differ covers; graph of meaning, not of imports |

## 8. Two-minute video script (target 1:50)

| Time | Screen | Voice-over |
| --- | --- | --- |
| 0:00–0:15 | Fixture diff: `@unit seconds` → `@unit milliseconds`, CI green | "This PR changes one word in a comment. TypeScript is happy. It is still a number." |
| 0:15–0:30 | `formatDuration` and the worker's `durationSec > limit` | "But the web app formats it as seconds, and a worker in another process alerts on it as seconds." |
| 0:30–0:55 | Terminal: `npm run analyze` | "Contract Drift loads both snapshots into a Relate graph, finds the meaning change with a Cypher query, then walks every path to code that reads it, including a queue link static analysis cannot see." |
| 0:55–1:15 | Viewer Review tab, hover the worker card, path lights up dashed | "Each entry has the file, the line, and the path. And here is a test the PR never touched that still assumes seconds." |
| 1:15–1:30 | `--head pr-weight-kg` | "Change an unrelated field and the worker stays off the list." |
| 1:30–1:45 | Cypher tab, run "Tests not in diff"; Store tab | "Everything lives in one committed Relate file. Clone it, open it, ask your own questions." |
| 1:45–1:50 | Title card + repo URL | "Contract Drift. Same type, new meaning, caught in review." |

Record at 1440×900, terminal font 18 px, no music needed; captions burned in.

## 9. Devpost copy

- **Title:** Contract Drift
- **Tagline:** Catch the PR that passes TypeScript but changes what an API field means.
- **Description (short):** When `duration` goes from seconds to milliseconds, the type is still `number`
  and every check stays green. Contract Drift reads explicit meaning tags (`@unit`, `@format`, `@tz`) on
  shared contract fields, loads the base and head snapshots of a monorepo into one Relate graph of fields,
  producers, usages, function parameters, tests and declared hidden links (like a queue between services),
  and finds meaning changes with a Cypher query. Variable-length path queries then give the reviewer a
  ranked shortlist: MISMATCH where code states the old meaning, REVIEW where nothing is stated, and the
  tests to run, including ones the PR never touched, each with file:line evidence. It never guesses
  meaning and needs no API key. The graph is a single committed `.rl` file: clone, `npm install`,
  `npm run demo`.
- **Built with:** Relate (`@relate/relate`), TypeScript, ts-morph, Node.js, Express, Cytoscape.js.
- **AI use (required disclosure):** planning, code and docs drafted with AI coding assistants under the
  author's direction; all results in the README come from real runs. The product itself uses no AI.

## 10. Submission checklist

- [ ] Public repo `RealCloudyPanda/Neo4j-Hackathon`, topics `relate` (required) and
      `relate-neo4j-hackathon` (`gh repo edit --add-topic relate --add-topic relate-neo4j-hackathon`)
- [ ] All commits after 2026-11-11 (repo started 2026-11-20)
- [ ] `data/contract-drift.rl` committed and opens read-only on a fresh clone
- [ ] Fresh-clone test: `git clone … && npm install && npm run demo` works with nothing else
- [ ] README follows their template: Project name + one-line pitch; Use case; How it uses Relate
      (Mode: **single file**; Why this mode; What the graph models); Setup and run; Where the data lives.
      Plus: screenshots, Known limitations, How this was built (AI disclosure), License
- [ ] Demo video 1–2 min, public link in Devpost
- [ ] Devpost: description, "significant AI use" described, built-with list, repo link
- [ ] LICENSE (MIT) at root
- [ ] No secrets, no `.env`, no network needed at runtime
- [ ] Submitted before 2026-12-11 21:00 ET (aim for 2026-12-09)

# Grill log (self-interview)

Method: grill-with-docs (grilling + domain modeling), run as a self-interview because the owner is asleep.
Standing instruction from the owner: **accept the recommended answer**. Each question lists the
recommendation (➡️) and the decision (✅). Terms in **bold** are defined in `GLOSSARY.md`.

## Round 1: Who is this for, and what hurts?

**Q1. Who is the one user?**
➡️ A **reviewer** on a TypeScript monorepo PR (tRPC API + web app + background worker), who must approve a
change to a shared contract without knowing every place that reads it.
✅ Accepted.

**Q2. What is the one painful task?**
➡️ "This PR changes `OrderSummary.duration` from seconds to milliseconds. Type check is green. Who else
needs to look, and which tests should I run?" Today: grep for `duration` (hundreds of hits), or trust the
author.
✅ Accepted.

**Q3. What does success look like in one sentence?**
➡️ In under 2 seconds the reviewer gets a ranked **shortlist** of affected **usages** and **tests**, each
with file:line **evidence** and the **impact path**, including a test file the PR never touched, and the
shortlist is empty of noise for an unrelated change.
✅ Accepted.

**Q4. Is this a CI bot, a CLI, or a web app?**
➡️ CLI first (it is what CI and the demo both need), plus a small local **viewer** for exploring the graph.
No GitHub App (needs accounts and secrets).
✅ Accepted.

## Round 2: What does "meaning" mean? (honesty boundary)

**Q5. Do we infer meaning from code or names (e.g. "duration" ⇒ time)?**
➡️ No. Meaning comes only from **explicit contract metadata**: JSDoc tags on contract fields and on
function parameters. We never claim to guess semantics. Hard to reverse because the whole pitch rests on it
(ADR 0002).
✅ Accepted.

**Q6. Which tags?**
➡️ `@unit` (seconds, milliseconds, cents, dollars, grams, kilograms…), `@format` (iso-date, epoch…),
`@tz` (utc, local). A **meaning change** is any change in one of these tags on the same field key.
Start with `@unit`; the others are the same code path and get one fixture case each only if time allows.
✅ Accepted.

**Q7. What about a field with no tags?**
➡️ It is not a contract field. It is ignored. The README says so plainly.
✅ Accepted.

**Q8. What about a usage that has no unit annotation of its own?**
➡️ It is still shortlisted, as **REVIEW** (we can see it reads the field, we cannot verify its
assumption). A usage whose value flows into a parameter tagged with a *different* unit is **MISMATCH**.
A usage tagged with the *new* unit is **OK** and listed under "already updated".
✅ Accepted.

**Q9. Optional AI explanation of paths?**
➡️ Skip. It adds a key, a failure mode and doubt about "invented dependencies". Every line of output comes
from the graph. (The README still discloses AI-assisted development, as the rules require.)
✅ Accepted.

## Round 3: Graph model

**Q10. Why a graph at all, not a JSON report?**
➡️ Because the answer is a set of **paths** of different lengths across different edge kinds:
field → usage → function parameter; field → (manifest link) → worker field → usage; usage's file ←
imported by ← test. One variable-length Cypher query answers "what is reachable from this change", and
the same graph answers ad-hoc questions in the viewer's Cypher console.
✅ Accepted.

**Q11. One graph per snapshot, or both snapshots in one graph?**
➡️ One graph, every snapshot-scoped node carries `snapshot`. The **drift** itself is found *in Cypher*
by matching `FieldVersion` nodes of the base and head snapshots with the same key and different tags.
The diff is a graph query, not JS.
✅ Accepted.

**Q12. Which code graph do we traverse for impact: base or head?**
➡️ Head (the PR as it would merge). Base is used for field versions and for "was this file changed".
✅ Accepted.

**Q13. Do we persist results (findings) in the graph?**
➡️ Yes: `(:Drift)-[:ON]->(:Field)` and `(:Drift)-[:FLAGS {rank, verdict}]->(:Usage|:Test)`. Then the
committed store *contains the answer*, and judges can see it with one query.
✅ Accepted.

**Q14. How do tests attach?**
➡️ Through the import graph: `(:File {isTest:true})-[:IMPORTS*1..3]->(:File)<-[:IN_FILE]-(:Usage)`.
A test is shortlisted when it reaches a flagged usage's file within 3 import hops. Its `inDiff` flag says
whether the PR touched it.
✅ Accepted.

**Q15. What does the manifest hold?**
➡️ Only links static analysis cannot establish (queue messages, HTTP to another repo, env-configured
callbacks): `{ from, to, via, reason }`. Stored as `LINKED_TO {source:"manifest"}` edges so the viewer can
style them differently and the shortlist can say "via manifest".
✅ Accepted.

## Round 4: Relate store

**Q16. Mode: in memory, directory, or single file?**
➡️ **Single file** `data/contract-drift.rl`, committed. Spike showed a plain copy of a `.rl` opens in a
fresh process; directory stores fail to open without their lock files. Unit tests use `:memory:`.
(ADR 0001.)
✅ Accepted.

**Q17. How do judges explore it without installing anything else?**
➡️ Three ways: `npm run viewer` (graph + shortlist + read-only Cypher console with preset queries),
`npm run cypher -- "MATCH …"` (prints a table), and, optionally, the Relate CLI with `--read-only`.
`queries/*.cypher` holds the named queries the tool itself uses.
✅ Accepted.

**Q18. Rebuilds and git noise?**
➡️ `npm run build:graph` rebuilds only when the fixture fingerprint changed (stored in `:Meta`), or with
`--force`. `npm run demo` never dirties the working tree on a fresh clone.
✅ Accepted.

**Q19. Writer/reader conflict?**
➡️ Builder opens writable, checkpoints, exits. Viewer and `analyze` open read-only. `analyze --save`
(writes findings) is part of the build step, not the viewer.
✅ Accepted.

## Round 5: Fixture

**Q20. How are before/after represented?**
➡️ Plain directories: `examples/shop-monorepo/snapshots/{base,pr-duration-ms,pr-weight-kg}`. No nested
git repos. Judges can `diff -r` them. The tool computes `inDiff` from file content hashes.
✅ Accepted.

**Q21. What is in the positive case?**
➡️ PR "pr-duration-ms": contracts + API producer change `OrderSummary.duration` from `@unit seconds` to
`@unit milliseconds`. Not touched: the web `formatDuration(seconds)` helper (param tagged seconds →
MISMATCH), the web row component (REVIEW), the worker's `SlaJob.durationSec` reached only via the manifest
(MISMATCH), and `apps/worker/src/sla.test.ts` (shortlisted test, not in diff).
✅ Accepted.

**Q22. What is in the negative case?**
➡️ PR "pr-weight-kg": `OrderSummary.weight` changes grams → kilograms. Only the web shipping label reads
it. The worker and its test must **not** appear. A test asserts this.
✅ Accepted.

**Q23. Is the fixture real code?**
➡️ Yes: real TypeScript that type-checks (`tsc --noEmit` per snapshot in a test), with a minimal tRPC-shaped
router (local `t.procedure` stub so the fixture needs no install). Small: about 15 files per snapshot.
✅ Accepted.

## Round 6: UX

**Q24. CLI shape?**
➡️ `npx contract-drift analyze --base base --head pr-duration-ms` (defaults point at the fixture), output
grouped: drift header → shortlist (rank, verdict, file:line, why, path) → tests (with "not in diff") →
"not affected" count. `--json`, `--markdown` (PR-comment ready). Exit code 1 when any MISMATCH.
✅ Accepted.

**Q25. Viewer screens?**
➡️ One page, three panes: left = PR picker + drift list; centre = impacted subgraph (Cytoscape), path
highlights on hover; right = shortlist with code snippets. A "Cypher" tab with read-only console and preset
queries, and a "Store" tab with label/rel counts and where the file lives.
✅ Accepted.

**Q26. Visual direction?**
➡️ "Review desk": warm paper background, ink text, one signal colour (vermillion) for drift/mismatch,
muted slate for context, IBM Plex Sans/Mono via `@fontsource` (local files). Dense, left-aligned, no
gradients, no emoji.
✅ Accepted.

## Round 7: Submission

**Q27. Name?**
➡️ Keep **Contract Drift** (the idea's name; tagline does the work). CLI binary `contract-drift`.
✅ Accepted.

**Q28. What is out of scope?**
➡️ GitHub App, real git ref checkout, OpenAPI/GraphQL input, runtime traffic, LLM features, monorepos
other than the fixture (the tool runs on any folder layout with a config, but only the fixture is tested).
✅ Accepted.

# Submission pack: Relate by Neo4j Hackathon

Draft for the owner. Nothing here has been submitted. Rules checked on relate.devpost.com on 2026-11-21.

## Rules that matter (as read on 2026-11-21)

| Item | What the rules say | Status |
| --- | --- | --- |
| Deadline | **Fri Dec 11 2026, 6:00 PM PST (9:00 PM ET)**. Submissions can be edited until then. | Aim to submit by **Wed Dec 9**. |
| Eligibility | 18+ (or the age of majority where you live, if higher). | Owner to confirm. |
| New project | Started on or after Nov 11 2026. | First commit 2026-11-20. OK. |
| Public repo + topic `relate` | Required; must stay public and tagged through judging. `relate-neo4j-hackathon` recommended. | Both topics set; repo public. OK. |
| Persistent store | A directory or single file judges can inspect. | `data/contract-drift.rl` committed. OK. |
| README template | Use case / How it uses Relate (mode, why, what the graph models) / Setup and run / Where the data lives. | README follows it. OK. |
| Demo | **Video up to 2 minutes** (overview says 1–2 min), or a working-demo link. Your own filming and editing; no third-party music without permission; viewable without login. | Not recorded. Script below runs 1:50. |
| Statement of tools | Which Relate capabilities, third-party tools and AI tools the project uses; describe significant AI use. | Drafted below. |
| License | Encouraged. | MIT; GitHub detects it. OK. |

**Judging.** The overview page gives points: Relate & connected context 30, Functionality & completeness 25, Usefulness 20, Documentation & reproducibility 15, Creativity 10. The official rules (section 5) instead say five criteria are "weighted equally". The pages disagree; either way, Relate usage and "clone it, run it, it works" carry the most weight.

Note: the README and SPEC call the video "1–2 min", so a 2–3 minute cut would break the rules here. The script is 1:50.

## Video script (target 1:50, hard cap 2:00)

Record at 1440×900, terminal font 18 px, captions burned in, no music. Every command below was run on 2026-11-21 and produced the output described.

| Time | Screen | Voice-over |
| --- | --- | --- |
| 0:00–0:08 | Terminal: `npx tsc -p examples/shop-monorepo/snapshots/pr-duration-ms --noEmit` returns with no output. Caption: "TypeScript: green". | "This pull request type-checks. CI is green." |
| 0:08–0:20 | Cut straight to `npm run analyze`. Zoom on row 2: `MISMATCH apps/worker/src/sla.ts:7 … via queue orders.completed`. | "And it will page on-call for every order that takes longer than seven seconds. This tool caught that in a service the PR never touched." |
| 0:20–0:35 | Diff of `packages/contracts/src/order.ts` (`@unit seconds` → `@unit milliseconds`) and `routers/order.ts` (the `/ 1000` removed). | "The PR switches `duration` from seconds to milliseconds. It's still a `number`, so the compiler can't help. Grep finds hundreds of `duration`s." |
| 0:35–0:55 | Back to the analyze output, rows 1–3, then rows 4–7. | "Contract Drift loads both snapshots into one Relate graph and finds the meaning change with a Cypher query. Then it walks variable-length paths to every place that reads the field: the web formatter that still expects seconds, the worker reached through a queue, and the tests to run, including three the PR didn't touch." |
| 0:55–1:15 | `npm run viewer`, Review tab. Hover the worker entry; the dashed `LINKED_TO` path lights up. | "Each finding carries the file, the line and the exact path through the graph. The dashed edge is a hidden link: a queue between services that static analysis can't see, declared once in a manifest." |
| 1:15–1:28 | `npm run analyze -- --head pr-weight-kg`. Point at the shortlist: shipping label only. | "Change an unrelated field and the worker stays off the list. It flags what the change reaches and nothing else." |
| 1:28–1:45 | Viewer Cypher tab: run the "Tests not in diff" preset. Then the Store tab (file path, counts, fingerprint). | "The findings are written back to the graph, so you can ask your own questions in Cypher. Everything lives in one committed Relate file." |
| 1:45–1:50 | Title card: "Contract Drift — same type, new meaning, caught in review." Repo URL. | "Clone it, run `npm run demo`, and you're looking at the same graph." |

Recording notes:
- Stop the viewer before any `npm run build:graph -- --force` (single-writer store). The demo itself never needs a rebuild.
- Before filming, run `npm run demo` once from a fresh clone so the take matches what judges will see.
- After recording, check the length is under 2:00 and upload as public or unlisted (viewable without login).

## Devpost text

**Project name:** Contract Drift

**Elevator pitch** (≤200 chars):

> Catch the PR that passes TypeScript but changes what an API field means. One Relate graph turns a unit change into a ranked shortlist of the code and tests it reaches.

**About the project** (Devpost's markdown field):

```markdown
## The problem
A pull request changes `OrderSummary.duration` from seconds to milliseconds. It is still a `number`, so
TypeScript is green and CI passes. But a web formatter still assumes seconds, and a background worker that
receives the value through a queue compares it against a two-hour SLA written in seconds. After the merge,
every order that takes longer than 7.2 seconds pages on-call. Schema differs and type checkers can't see this:
the type never changed, only the meaning.

## What it does
Contract Drift reads explicit meaning tags (`@unit`, `@format`, `@tz`) on shared contract fields, loads the
base and head snapshots of a TypeScript monorepo into one Relate graph, and finds meaning changes with a
Cypher query. Variable-length path queries then give the reviewer a ranked shortlist:

- **MISMATCH** where the value reaches code or a linked field that states the old meaning
- **REVIEW** where nothing on the path states a meaning
- **TEST** for the tests to run, including tests the PR never touched

Every entry has file:line evidence and the impact path. On an unrelated change (grams → kilograms on a
different field) the worker stays off the list. It never guesses meaning and needs no account, key or network.

## How it uses Relate
- **Mode: single file** (`data/contract-drift.rl`, committed). A copied `.rl` opens read-only in a fresh
  process with no side files, so judges can clone and query it with no rebuild.
- **What the graph models:** snapshots, files and imports, fields and their per-snapshot versions, producers,
  usages, function parameters, tests, and hidden `LINKED_TO` edges (such as a queue between services).
- **The diff happens in the graph:** both snapshots live side by side; a meaning change is the same `Field`
  with a different tag in two `FieldVersion`s.
- **Findings are persisted** as `(:Drift)-[:FLAGS {rank, verdict, pathText}]->` so the CLI, the viewer and
  ad-hoc Cypher all read the same answer.
- Relate allows one writer per store and has no `close()`, so `build:graph` is the only writer and exits;
  the CLI and the viewer open the store read-only. A content fingerprint in a `:Meta` node skips rebuilds,
  so running the demo leaves `git status` clean.

## How I built it
TypeScript on Node 22. ts-morph extracts tagged fields, producers, usages and parameter flow; the graph is
loaded with `UNWIND` batches; review queries live in `queries/*.cypher` and are loaded verbatim. The viewer
is Express plus Cytoscape.js with Review, Cypher and Store tabs. The CLI prints text, JSON or Markdown for
a PR comment, and exits 1 when it finds a MISMATCH.

## Challenges
- Relate's single-writer store with no `close()`: designed a build-then-exit writer and read-only readers.
- `.rl` bytes differ between identical builds: added a fingerprint so a judge's run doesn't dirty the repo.
- Values that cross a queue have no import to follow: added a small declared-links manifest, stored in the
  graph with `source: "manifest"`.

## What's next
Broader interprocedural flow beyond the implemented bounded immutable aliases,
checking out git refs directly, and a GitHub Action that posts the `--markdown` table on pull requests.

## Built with AI assistance
Planning, code and docs were drafted with AI coding assistants under my direction and checked by running
them. The product itself uses no AI: every finding comes from the graph. All output shown comes from real runs.
```

**Built with:** `relate` · `cypher` · `typescript` · `node.js` · `ts-morph` · `express` · `cytoscape.js`

**Try it out:** `https://github.com/RealCloudyPanda/Neo4j-Hackathon`

**Statement of tools** (if the form asks separately):
- Relate capabilities: embedded Node library (`@relate/relate` 1.1.0), single-file store, Cypher (variable-length paths, `MERGE`/`UNWIND` loading, uniqueness constraints, explicit transactions), read-only opens.
- Third-party tools: ts-morph, Express, Cytoscape.js, tsx, TypeScript.
- AI tools: [[OWNER: name the assistants you actually used, e.g. Claude Code and Codex]] for planning, code and docs; no AI at runtime.

## Before you press submit
- [ ] Watch the video once: under 2:00, captions readable, public or unlisted.
- [ ] Fresh clone on another folder: `npm install && npm run demo` works.
- [ ] Repo still public with topics `relate` and `relate-neo4j-hackathon`.
- [ ] Fill the one `[[OWNER]]` line above.
- [ ] Submit by Dec 9; the deadline is Dec 11, 6:00 PM PST.

## Repair demo extension — verified 2026-11-21

For a repair-focused take, choose the telemetry fixture in the viewer: broken has two MISMATCH consumers, partial has one MISMATCH and one OK, and fixed has zero MISMATCH and two OK. Compare fixed against broken to show two explicitly repaired paths, then download the Markdown comparison. The original meaning drift stays visible; disappeared evidence is not counted as repaired. The fixture and commands are in the README. Canonical module/namespace keys prevent duplicate-name collisions, and removed metadata raises REVIEW. Use this actual implemented behavior when replacing the older "what's next" copy above.

Remaining owner steps are video/public demo publication, final tools wording, and submitting the entry. Scripted checks do not establish runtime correctness of arbitrary applications.

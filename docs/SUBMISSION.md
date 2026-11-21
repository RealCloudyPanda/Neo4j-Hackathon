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

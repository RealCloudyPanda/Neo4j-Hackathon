# Contract Drift

Catch the PR that passes TypeScript but changes what an API field means.

> Status: in development for the Relate by Neo4j Hackathon (Nov–Dec 2026). This README follows the
> hackathon template and will be filled in with real output and screenshots as the build lands.

## Use case

A reviewer approves a PR that changes `OrderSummary.duration` from seconds to milliseconds. It is still a
`number`, so the type check is green, but a web formatter and a background worker still assume seconds.
Contract Drift reads explicit meaning tags (`@unit`, `@format`, `@tz`) on shared contract fields and gives
the reviewer a ranked shortlist of the usages and tests the change reaches, with file:line evidence,
including tests the PR never touched.

## How it uses Relate

- **Mode:** single file (`data/contract-drift.rl`, committed).
- **Why this mode:** a copied `.rl` file opens in a fresh process with no side files, so judges can clone and
  query it immediately. See `docs/adr/0001-single-file-relate-store.md`.
- **What the graph models:** contract fields and their versions per snapshot, producers, usages, function
  parameters, files and imports, tests, hidden links between services, and the detected drifts with their
  flagged impact paths. See `docs/SPEC.md` section 3.

## Setup and run

Coming with the first working build (`npm install && npm run demo`).

## Where the data lives

| What | Where |
| --- | --- |
| Relate store | `data/contract-drift.rl` |
| Queries the tool runs | `queries/*.cypher` |
| Sample monorepo (base and two PR snapshots) | `examples/shop-monorepo/` |

## Project docs

`docs/SPEC.md` (spec), `docs/PLAN.md` (build plan), `docs/RESEARCH.md` (Relate spike and prior art),
`docs/GRILL.md` (design decisions), `docs/adr/` (hard-to-reverse decisions), `GLOSSARY.md` (terms).

## How this was built

Planned and built with AI coding assistants under the author's direction. The product itself uses no AI;
every finding comes from the graph.

## License

MIT, see `LICENSE`.

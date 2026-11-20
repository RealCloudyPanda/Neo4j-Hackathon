# shop-monorepo fixture

A tiny TypeScript monorepo (tRPC-shaped API, web app, background worker) in three snapshots.
Every snapshot type-checks with `tsc --noEmit`. Contract Drift loads all three into one Relate graph.

| Snapshot | Changed files vs `base` | The change |
| --- | --- | --- |
| `base` | none | `OrderSummary.duration` is `@unit seconds`, `weight` is `@unit grams` |
| `pr-duration-ms` | `packages/contracts/src/order.ts`, `apps/api/src/routers/order.ts`, `apps/api/src/routers/order.test.ts` | `duration` becomes `@unit milliseconds`; the producer stops dividing by 1000 |
| `pr-weight-kg` | the same three files | `weight` becomes `@unit kilograms`; the producer divides by 1000 |

The worker (`apps/worker`) never imports `@shop/contracts`. It receives `durationSec` through the
`orders.completed` queue, typed with its own `SlaJob` interface. `contract-drift.links.json` declares that
hidden link by hand.

## Expected results

- `base..pr-duration-ms`: one drift (`@unit seconds → milliseconds`). MISMATCH in
  `apps/web/src/views/orderRow.ts` (passes to `formatDuration(@unit seconds)`) and in
  `apps/worker/src/sla.ts` (through the hidden link); REVIEW in `apps/api/src/events.ts`; tests include
  `apps/worker/src/sla.test.ts`, which the PR does not touch.
- `base..pr-weight-kg`: one drift (`@unit grams → kilograms`). MISMATCH in
  `apps/web/src/views/shippingLabel.ts`; nothing under `apps/worker/` is flagged.
- `base..base`: no drifts.

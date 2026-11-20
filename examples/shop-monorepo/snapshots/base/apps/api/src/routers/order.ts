import type { OrderSummary } from "@shop/contracts";
import { router, t } from "../trpc";

interface OrderRow { id: string; status: OrderSummary["status"]; startedAt: number; doneAt: number; grams: number; cents: number; placed: string }

export function toSummary(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    status: row.status,
    duration: Math.round((row.doneAt - row.startedAt) / 1000),
    weight: row.grams,
    totalCents: row.cents,
    placedAt: row.placed,
  };
}

export const orderRouter = router({
  summary: t.procedure.input((raw) => String(raw)).query(({ input }) => toSummary(loadRow(input))),
});

function loadRow(id: string): OrderRow {
  return { id, status: "shipped", startedAt: 0, doneAt: 7000, grams: 1250, cents: 4999, placed: "2026-11-20" };
}

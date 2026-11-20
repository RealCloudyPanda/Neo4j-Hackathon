import type { OrderSummary } from "@shop/contracts";
import { formatDuration, formatMoney } from "../lib/format";

export interface RowCells {
  id: string;
  took: string;
  total: string;
}

// One row in the "Recent orders" table.
export function orderRow(order: OrderSummary): RowCells {
  return {
    id: order.id,
    took: formatDuration(order.duration),
    total: formatMoney(order.totalCents),
  };
}

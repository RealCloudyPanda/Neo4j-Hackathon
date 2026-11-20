import type { OrderSummary } from "@shop/contracts";
import { formatWeight } from "../lib/format";

// Text printed on the parcel label.
export function shippingLabel(order: OrderSummary): string {
  const { id, placedAt } = order;
  return `${id} · placed ${placedAt} · ${formatWeight(order.weight)}`;
}

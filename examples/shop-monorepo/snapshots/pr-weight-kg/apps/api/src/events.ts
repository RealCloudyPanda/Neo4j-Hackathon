import type { OrderSummary } from "@shop/contracts";

export interface Queue {
  publish(topic: string, body: string): void;
}

// Fired when an order ships. The worker consumes "orders.completed" with its own SlaJob type.
export function publishCompleted(queue: Queue, summary: OrderSummary): void {
  const message = {
    orderId: summary.id,
    durationSec: summary.duration,
  };
  queue.publish("orders.completed", JSON.stringify(message));
}

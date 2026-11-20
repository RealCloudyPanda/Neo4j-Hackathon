/** The order summary returned by `order.summary` and shown across the web app. */
export interface OrderSummary {
  id: string;
  status: "placed" | "packed" | "shipped";
  /**
   * How long fulfilment took.
   * @unit milliseconds
   */
  duration: number;
  /**
   * Parcel weight.
   * @unit grams
   */
  weight: number;
  /**
   * Order total.
   * @unit cents
   */
  totalCents: number;
  /**
   * When the order was placed.
   * @format iso-date
   */
  placedAt: string;
}

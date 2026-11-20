// The worker owns its message types: nothing here imports @shop/contracts.
export interface SlaJob {
  orderId: string;
  /**
   * Fulfilment time copied from the API's order summary.
   * @unit seconds
   */
  durationSec: number;
}

export function parseJob(body: string): SlaJob {
  return JSON.parse(body) as SlaJob;
}

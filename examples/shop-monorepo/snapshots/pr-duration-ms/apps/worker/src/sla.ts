import type { SlaJob } from "./queue";

export const SLA_LIMIT_SECONDS = 2 * 60 * 60;

// Pages on-call when fulfilment took longer than the SLA.
export function isBreached(job: SlaJob): boolean {
  return job.durationSec > SLA_LIMIT_SECONDS;
}

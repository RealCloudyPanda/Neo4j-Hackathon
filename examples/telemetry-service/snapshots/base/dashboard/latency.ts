import type { Reading } from '../schema/reading.js';
export function formatLatency(/** @unit seconds */ value: number): string {
  return `${value}} s`;
}
export function latencyLabel(reading: Reading): string {
  const { elapsed: duration } = reading;
  const stable = duration;
  return formatLatency(stable);
}

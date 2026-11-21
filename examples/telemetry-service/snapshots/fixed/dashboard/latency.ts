import type { Reading } from '../schema/reading.js';
export function formatLatency(/** @unit milliseconds */ value: number): string {
  return `${value / 1000}} s`;
}
export function latencyLabel(reading: Reading): string {
  const { elapsed: duration } = reading;
  const stable = duration;
  return formatLatency(stable);
}

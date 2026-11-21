import type { Reading } from '../schema/reading.js';
export function measure(sensorId: string, startMs: number, endMs: number): Reading {
  return { sensorId, elapsed: endMs - startMs };
}

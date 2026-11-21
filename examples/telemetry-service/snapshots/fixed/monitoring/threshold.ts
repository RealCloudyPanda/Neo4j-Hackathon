import type { Reading } from '../schema/reading.js';
function exceedsBudget(/** @unit milliseconds */ duration: number): boolean {
  return duration > 5000;
}
export function shouldAlert(reading: Reading): boolean {
  const duration = reading.elapsed;
  return exceedsBudget(duration);
}

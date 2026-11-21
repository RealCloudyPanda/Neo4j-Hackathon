import type { Reading } from '../schema/reading.js';
function exceedsBudget(/** @unit seconds */ duration: number): boolean {
  return duration > 5;
}
export function shouldAlert(reading: Reading): boolean {
  const duration = reading.elapsed;
  return exceedsBudget(duration);
}

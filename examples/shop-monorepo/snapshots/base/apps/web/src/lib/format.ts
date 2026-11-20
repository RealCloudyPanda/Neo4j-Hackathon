/** Human-readable duration. */
export function formatDuration(/** @unit seconds */ seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Parcel weight for labels. */
export function formatWeight(/** @unit grams */ grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`;
}

/** Money with two decimals. */
export function formatMoney(/** @unit cents */ cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

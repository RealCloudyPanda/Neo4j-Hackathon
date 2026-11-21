/** A batch processor publishes one measured task latency. */
export interface Reading {
  sensorId: string;
  /** @unit milliseconds */
  elapsed: number;
}

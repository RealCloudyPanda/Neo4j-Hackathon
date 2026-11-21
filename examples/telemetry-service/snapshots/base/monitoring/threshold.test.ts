import { shouldAlert } from './threshold.js';
export const breached: boolean = shouldAlert({ sensorId: 'batch-1', elapsed: 6 });

import { join } from 'node:path';
import { ROOT } from '../relate/store.ts';

export const SNAPSHOT_CATALOG = [
  { id: 'base', fixture: 'shop-monorepo', folder: 'base', title: 'Shop · base' },
  { id: 'pr-duration-ms', fixture: 'shop-monorepo', folder: 'pr-duration-ms', title: 'Shop · duration milliseconds' },
  { id: 'pr-weight-kg', fixture: 'shop-monorepo', folder: 'pr-weight-kg', title: 'Shop · weight kilograms' },
  ...['base', 'broken', 'partial', 'fixed'].map(folder => ({ id: `telemetry-${folder}`, fixture: 'telemetry-service', folder, title: `Telemetry · ${folder}` })),
].map(s => ({ ...s, dir: join(ROOT, 'examples', s.fixture, 'snapshots', s.folder) }));

export const CASE_CATALOG = [
  { base: 'base', head: 'pr-duration-ms', title: 'Shop · stale duration consumers' },
  { base: 'base', head: 'pr-weight-kg', title: 'Shop · unrelated weight change' },
  { base: 'base', head: 'base', title: 'Shop · no meaning change' },
  ...['broken', 'partial', 'fixed'].map(stage => ({ base: 'telemetry-base', head: `telemetry-${stage}`, title: `Telemetry repair · ${stage}` })),
];
export function snapshotDirectory(id: string): string | undefined {
  return SNAPSHOT_CATALOG.find(s => s.id === id)?.dir;
}

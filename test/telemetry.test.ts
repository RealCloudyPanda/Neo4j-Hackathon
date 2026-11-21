import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { CASE_CATALOG, SNAPSHOT_CATALOG } from '../src/graph/catalog.ts';
import { populate } from '../src/graph/build.ts';
import { openStore } from '../src/relate/store.ts';
import { readReview } from '../src/review/read.ts';
const snapshots = SNAPSHOT_CATALOG.filter(s => s.fixture === 'telemetry-service');
const store = openStore(':memory:');
populate(store, snapshots, () => {}, CASE_CATALOG.filter(c => c.base === 'telemetry-base'));
for (const [head, mismatch, ok] of [['broken',2,0], ['partial',1,1], ['fixed',0,2]] as const) {
 test(`telemetry ${head} has ${mismatch} mismatches and ${ok} repaired consumers`, () => {
  const r = readReview(store, 'telemetry-base', `telemetry-${head}`);
  assert.equal(r.drifts.length,1);
  assert.equal(r.counts.MISMATCH,mismatch);
  assert.equal(r.counts.OK,ok);
  assert.ok(r.drifts[0].entries.some(e => e.verdict === 'TEST' && !e.inDiff));
 });
}
test('every telemetry snapshot typechecks independently', () => {
 for (const s of snapshots) {
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', s.dir, '--noEmit'], {encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
 }
});

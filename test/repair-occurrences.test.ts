import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { populate } from '../src/graph/build.ts';
import { openStore } from '../src/relate/store.ts';
import { readReview } from '../src/review/read.ts';
import { compareReviews, repairMarkdown } from '../src/review/compare.ts';

test('two consumer occurrences on one line remain separate through partial and full repairs', () => {
  const root = mkdtempSync(join(tmpdir(), 'contract-drift-occurrences-'));
  try {
    const snapshots = ['base', 'broken', 'partial', 'fixed'].map(id => {
      const dir = join(root, id);
      mkdirSync(dir);
      writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] }));
      writeFileSync(join(dir, 'schema.ts'), `export interface Event {\n/** @unit ${id === 'base' ? 'seconds' : 'milliseconds'} */\nelapsed: number;\n}`);
      writeFileSync(join(dir, 'format.ts'), `export function first(/** @unit ${['partial', 'fixed'].includes(id) ? 'milliseconds' : 'seconds'} */ n: number) { return n; }\nexport function second(/** @unit ${id === 'fixed' ? 'milliseconds' : 'seconds'} */ n: number) { return n; }`);
      writeFileSync(join(dir, 'use.ts'), `import { Event } from './schema';\nimport { first, second } from './format';\nexport function render(event: Event) { return [first(event.elapsed), second(event.elapsed)]; }`);
      return { id, dir };
    });
    const store = openStore(':memory:');
    populate(store, snapshots);
    const broken = readReview(store, 'base', 'broken');
    assert.equal(broken.counts.MISMATCH, 2);
    const partial = compareReviews(broken, readReview(store, 'base', 'partial'));
    assert.equal(partial.changes.length, 2);
    assert.equal(partial.resolved, 1);
    assert.equal(partial.remaining, 1);
    assert.deepEqual(partial.changes.map(c => c.after).sort(), ['MISMATCH', 'OK']);
    const fixed = compareReviews(broken, readReview(store, 'base', 'fixed'));
    assert.equal(fixed.resolved, 2);
    assert.equal(fixed.changes.length, 2);
    assert.equal(new Set(fixed.changes.map(c => c.column)).size, 2);
    for (const change of fixed.changes) assert.ok(repairMarkdown(fixed).includes(`use.ts:3:${change.column}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

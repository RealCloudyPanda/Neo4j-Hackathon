import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../src/relate/store.ts';
import { populate } from '../src/graph/build.ts';
import { readReview } from '../src/review/read.ts';

test('removing metadata keeps the untagged field and raises REVIEW, never silently clears drift', t => {
  const root = mkdtempSync(join(tmpdir(), 'drift-removal-'));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  const dirs = ['base', 'head'].map(id => {
    const dir = join(root, id); mkdirSync(dir);
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({compilerOptions:{strict:true},include:['*.ts']}));
    writeFileSync(join(dir, 'contract.ts'), `export interface Event {\n ${id === 'base' ? '/** @unit seconds */' : ''}\n duration: number;\n}\nexport function read(e: Event) { return e.duration; }`);
    return {id, dir};
  });
  const store = openStore(':memory:'); populate(store, dirs);
  const report = readReview(store, 'base', 'head');
  assert.equal(report.drifts[0].after, '<removed>');
  assert.equal(report.drifts[0].entries[0].verdict, 'REVIEW');
  assert.match(report.drifts[0].entries[0].reason, /metadata removed/);
});

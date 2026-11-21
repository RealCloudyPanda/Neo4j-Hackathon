import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Project } from 'ts-morph';
import { extractFields } from '../src/extract/fields.ts';
import { readLinks } from '../src/extract/links.ts';

test('same-named contracts in different modules remain distinct', () => {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const name of ['a', 'b']) project.createSourceFile(`/fixture/${name}.ts`, 'export interface Event { /** @unit seconds */ duration: number }');
  const fields = extractFields(project, '/fixture');
  assert.equal(new Set(fields.map(f => f.rec.key)).size, 2);
  assert.deepEqual(fields.map(f => f.rec.displayName), ['Event.duration', 'Event.duration']);
});
test('manifest short selectors reject ambiguity and accept full identity', t => {
  const dir = mkdtempSync(join(tmpdir(), 'drift-links-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const keys = new Set(['a.ts#Event.duration', 'b.ts#Event.duration']);
  const write = (from: string) => writeFileSync(join(dir, 'contract-drift.links.json'), JSON.stringify({links:[{from, to:'b.ts#Event.duration', via:'queue'}]}));
  write('Event.duration');
  assert.throws(() => readLinks(dir, keys), /ambiguous.*a.ts#Event.duration/);
  write('a.ts#Event.duration');
  assert.equal(readLinks(dir, keys)[0].from, 'a.ts#Event.duration');
});

test('namespace owners qualify identities within the same module', () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/fixture/events.ts', 'namespace A { export interface Event { /** @unit seconds */ duration: number } } namespace B { export interface Event { /** @unit ms */ duration: number } }');
  assert.deepEqual(extractFields(project, '/fixture').map(f => f.rec.key), ['events.ts#A.Event.duration', 'events.ts#B.Event.duration']);
});

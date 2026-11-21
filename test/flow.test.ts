import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Project } from 'ts-morph';
import { extractFields } from '../src/extract/fields.ts';
import { extractUsages } from '../src/extract/usages.ts';

function usages(body: string) {
 const project = new Project({ useInMemoryFileSystem:true });
 project.createSourceFile('/flow/format.ts', 'export function seconds(/** @unit seconds */ n: number) { return n.toFixed(1); }');
 project.createSourceFile('/flow/main.ts', `import { seconds as imported } from './format';\n interface Event {\n /** @unit milliseconds */\n duration: number\n }\n function render(e: Event) { ${body} }`);
 return extractUsages(extractFields(project, '/flow'), '/flow').usages;
}
test('immutable scalar aliases reach imported parameter tags', () => {
 const rows = usages('const a = e.duration; const b = a; return imported(b);');
 assert.equal(rows[0].passesTo?.param.unit, 'seconds');
 assert.equal(rows[0].passesTo?.fn.name, 'seconds');
});
test('destructuring rename and immutable callable alias retain evidence', () => {
 const rows = usages('const { duration: elapsed } = e; const format = imported; return format(elapsed);');
 assert.equal(rows[0].passesTo?.param.unit, 'seconds');
});
test('mutable aliases and arithmetic never inherit consumer meaning tags', () => {
 assert.equal(usages('let a = e.duration; a /= 1000; return imported(a);')[0].passesTo, undefined);
 const transformed = usages('return imported(e.duration / 1000);')[0];
 assert.equal(transformed.passesTo, undefined);
 assert.match(transformed.flowNote!, /transform/);
});
test('alias traversal has a fixed depth bound', () => {
 const chain = ['const a0 = e.duration;', ...Array.from({length:12}, (_,i)=>`const a${i+1} = a${i};`)].join(' ');
 assert.equal(usages(chain + 'return imported(a12);')[0].passesTo, undefined);
});

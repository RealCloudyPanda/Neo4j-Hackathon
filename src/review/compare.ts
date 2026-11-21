import type { Review } from './read.ts';
import type { Verdict } from './types.ts';

/** Compare evidence at the same contract, tag and source occurrence across repair snapshots. Column identity is deliberately conservative. */
export function compareReviews(before: Review, after: Review) {
  if (before.base !== after.base) throw new Error('Repair comparisons require the same base snapshot.');
  const flatten = (review: Review) => review.drifts.flatMap(d => d.entries.filter(e => e.verdict !== 'TEST').map(e => ({
    identity: JSON.stringify([d.key, d.tag, e.targetId.startsWith(`${review.head}:`) ? e.targetId.slice(review.head.length + 1) : e.targetId]), key: d.key, tag: d.tag,
    column: Number(e.targetId.split(':').at(-1)),
    path: e.path, line: e.line, verdict: e.verdict,
  })));
  const old = new Map(flatten(before).map(e => [e.identity, e]));
  const current = new Map(flatten(after).map(e => [e.identity, e]));
  const changes = [...new Set([...old.keys(), ...current.keys()])].sort().map(identity => {
    const a = old.get(identity); const b = current.get(identity); const evidence = b ?? a!;
    return { key: evidence.key, tag: evidence.tag, path: evidence.path, line: evidence.line, column: evidence.column,
      before: a?.verdict ?? null as Verdict | null, after: b?.verdict ?? null as Verdict | null,
      resolved: a?.verdict === 'MISMATCH' && b?.verdict === 'OK',
      missingEvidence: !!a && !b,
    };
  });
  return { base: before.base, before: before.head, after: after.head, counts: {before: before.counts, after: after.counts},
    resolved: changes.filter(c => c.resolved).length, remaining: after.counts.MISMATCH, changes,
    note: 'A disappeared evidence path is missing evidence, not a proven repair. OK means explicit metadata matches; this does not prove runtime correctness.' };
}
export function repairMarkdown(repair: ReturnType<typeof compareReviews>): string {
  const cell = (s: unknown) => String(s ?? 'missing evidence').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [`# Repair comparison`, '', `${repair.before} → ${repair.after} (base ${repair.base})`, '',
    `${repair.resolved} explicitly repaired paths; ${repair.remaining} mismatches remain.`, '',
    '| Evidence | Before | After |', '| --- | --- | --- |',
    ...repair.changes.map(c => `| ${cell(c.path)}:${c.line ?? ''}:${c.column} | ${cell(c.before)} | ${cell(c.after)} |`), '', repair.note, ''].join('\n');
}

import type { NodeValue, PathValue, RelationshipValue } from "@relate/relate";
import type { Store } from "../relate/store.ts";
import { nodeEl, relEl, type El } from "./elements.ts";

export function driftGraph(store: Store, id: string) {
  const els = new Map<string, El>();
  const highlight: Record<string, string[]> = {};
  const add = (v: NodeValue | RelationshipValue, extra?: Record<string, unknown>) => {
    if (els.has(v.elementId)) return;
    els.set(v.elementId, v.kind === "node" ? nodeEl(v, extra) : relEl(v));
  };

  const head = store.conn.query(
    `MATCH (d:Drift {id: $id})-[a:AFTER]->(h:FieldVersion)
     OPTIONAL MATCH (d)-[b:BEFORE]->(bv:FieldVersion)
     RETURN d, a, h, b, bv`,
    { id },
  ).rows[0];
  if (!head) return null;
  for (const k of ["d", "a", "h", "b", "bv"]) if (head[k]) add(head[k] as NodeValue);
  const dId = (head.d as NodeValue).elementId;
  const hId = (head.h as NodeValue).elementId;
  const aId = (head.a as RelationshipValue).elementId;

  const usages = store.conn.query(
    `MATCH (d:Drift {id: $id})-[:AFTER]->(h:FieldVersion)
     MATCH p = (h)-[:LINKED_TO*0..2]->(:FieldVersion)-[:READ_AT]->(u:Usage)
     WHERE EXISTS { MATCH (d)-[:FLAGS]->(u) }
     OPTIONAL MATCH q = (u)-[:PASSES_TO]->(:Param)-[:PARAM_OF]->(:Function)
     MATCH (d)-[f:FLAGS]->(u)
     RETURN u.id AS target, p, q, f.verdict AS verdict`,
    { id },
  ).rows;
  for (const r of usages) {
    const ids = [dId, aId, hId];
    for (const path of [r.p, r.q] as (PathValue | null)[]) {
      for (const v of path ?? []) {
        add(v, v.kind === "node" && v.labels[0] === "Usage" ? { verdict: r.verdict } : undefined);
        ids.push(v.elementId);
      }
    }
    highlight[String(r.target)] = [...new Set(ids)];
  }

  const tests = store.conn.query(
    `MATCH (d:Drift {id: $id})-[f:FLAGS {verdict: 'TEST'}]->(t:File)
     RETURN t, f.reaches AS reaches, f.hops AS hops, t.id AS target`,
    { id },
  ).rows;
  const usageByPath = new Map<string, string>();
  const fnByPath = new Map<string, string>();
  for (const el of els.values()) {
    const props = el.data.props as Record<string, unknown> | undefined;
    if (el.data.kind === "Usage") usageByPath.set(String(props?.path), String(el.data.id));
    if (el.data.kind === "Function") fnByPath.set(String(props?.path), String(el.data.id));
  }
  for (const r of tests) {
    const t = r.t as NodeValue;
    add(t, { verdict: "TEST", inDiff: t.properties.inDiff });
    const ids = [dId, t.elementId];
    const reaches = (r.reaches as string[]) ?? [];
    const targets = Number(r.hops) === 0 ? [hId] : reaches.map((p) => usageByPath.get(p) ?? fnByPath.get(p)).filter(Boolean);
    for (const target of targets as string[]) {
      const eid = `${t.elementId}->${target}`;
      els.set(eid, {
        data: { id: eid, source: t.elementId, target, type: Number(r.hops) === 0 ? "READS" : "IMPORTS", label: Number(r.hops) === 0 ? "reads" : Number(r.hops) > 1 ? `imports ×${r.hops}` : "imports" },
        classes: "test-edge",
      });
      ids.push(eid, target);
    }
    highlight[String(r.target)] = ids;
  }
  return { elements: [...els.values()], highlight };
}

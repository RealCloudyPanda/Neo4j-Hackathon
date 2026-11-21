/**
 * Viewer: Express over the committed store, opened read-only once at start (Relate has no close()
 * and allows no reader while a writer holds the file, so the viewer never writes).
 */
import express, { type Request, type Response } from "express";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { NodeValue, PathValue, RelationshipValue } from "@relate/relate";
import { parseArgs } from "../cli/args.ts";
import { listPresets } from "../cli/cypher.ts";
import { QUERIES_USED } from "../cli/analyze.ts";
import { readMeta } from "../graph/build.ts";
import { DEFAULT_STORE, describeError, loadQuery, openStore, ROOT, type Store } from "../relate/store.ts";
import { writeClause } from "../relate/guard.ts";
import { readReview } from "../review/read.ts";
import { snapshotDirectory } from '../graph/catalog.ts';
import { SNAPSHOT_TITLES } from "../extract/index.ts";

const EXAMPLES = join(ROOT, "examples");
const SNAPSHOTS = join(EXAMPLES, "shop-monorepo/snapshots");
const ROW_LIMIT = 500;
const TIMEOUT_MS = 2000;

type El = { data: Record<string, unknown>; classes?: string };

function shortLabel(n: NodeValue): string {
  const p = n.properties;
  switch (n.labels[0]) {
    case "Drift":
      return `${p.displayName ?? String(p.key).split("#").pop()}\n@${p.tag} ${p.before} → ${p.after}`;
    case "FieldVersion":
      return `${p.displayName ?? String(p.key).split("#").pop()}\n${p.unit ? `@unit ${p.unit}` : p.format ? `@format ${p.format}` : ""}`;
    case "Usage":
      return `${String(p.path).split("/").pop()}:${p.line}`;
    case "Param":
      return `${p.name}${p.unit ? ` @unit ${p.unit}` : ""}`;
    case "Function":
      return `${p.name}()`;
    case "File":
      return String(p.path).split("/").pop() ?? String(p.path);
    default:
      return String(p.id ?? p.key ?? p.name ?? n.labels[0]);
  }
}

export function nodeEl(n: NodeValue, extra: Record<string, unknown> = {}): El {
  return {
    data: { id: n.elementId, label: shortLabel(n), kind: n.labels[0], props: n.properties, ...extra },
    classes: n.labels[0].toLowerCase(),
  };
}

export function relEl(r: RelationshipValue): El {
  return {
    data: {
      id: r.elementId,
      source: r.startElementId,
      target: r.endElementId,
      type: r.type,
      label: r.type === "LINKED_TO" ? `hidden link · ${r.properties.via}` : r.type,
    },
    classes: r.type.toLowerCase(),
  };
}

/** Subgraph for one drift, plus for each shortlist target the element ids on its impact path. */
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

function snippet(snapshot: string, path: string, line: number) {
  const root = snapshotDirectory(snapshot);
  if (!root || !Number.isInteger(line) || line < 1) return null;
  const file = resolve(root, path);
  const rel = relative(root, file);
  if (rel.startsWith("..") || rel.includes(`..${sep}`) || !existsSync(file) || !statSync(file).isFile()) return null;
  const lines = readFileSync(file, "utf8").split("\n");
  const from = Math.max(1, line - 3);
  const to = Math.min(lines.length, line + 3);
  return { path, line, from, lines: lines.slice(from - 1, to) };
}

function storeInfo(store: Store) {
  const labels = store.query<{ label: string; n: number }>(
    "MATCH (n) UNWIND labels(n) AS label RETURN label, count(*) AS n ORDER BY n DESC, label",
  );
  const rels = store.query<{ type: string; n: number }>("MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS n ORDER BY n DESC, type");
  return {
    path: relative(ROOT, store.path),
    absPath: store.path,
    sizeBytes: statSync(store.path).size,
    mode: "single file (.rl)",
    readOnly: store.readOnly,
    meta: readMeta(store),
    labels: labels.map((r) => ({ label: r.label, n: Number(r.n) })),
    relationships: rels.map((r) => ({ type: r.type, n: Number(r.n) })),
    relateCli: `relate --database ./${relative(ROOT, store.path)} --read-only "MATCH (d:Drift)-[r:FLAGS]->(x) RETURN d.key, r.verdict, x.path"`,
  };
}

export function createApp(storePath = DEFAULT_STORE) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use(express.static(join(ROOT, "src/viewer/public")));
  app.use("/vendor/cytoscape", express.static(join(ROOT, "node_modules/cytoscape/dist")));
  app.use("/vendor/plex-sans", express.static(join(ROOT, "node_modules/@fontsource/ibm-plex-sans")));
  app.use("/vendor/plex-mono", express.static(join(ROOT, "node_modules/@fontsource/ibm-plex-mono")));

  let store: Store | null = null;
  let storeError: string | null = null;
  try {
    store = openStore(storePath, { readOnly: true });
  } catch (err) {
    storeError = describeError(err);
  }

  const need = (res: Response): Store | null => {
    if (!store) res.status(503).json({ error: storeError, hint: "Run `npm run build:graph`, then restart the viewer." });
    return store;
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: !!store, error: storeError });
  });

  app.get("/api/reviews", (_req, res) => {
    const s = need(res);
    if (!s) return;
    const cases = readMeta(s)?.comparisons ?? [];
    const reviews = cases.map(({base, head, title}) => {
      const r = readReview(s, base, head);
      return {
        base,
        head,
        title: title ?? SNAPSHOT_TITLES[head] ?? head,
        counts: r.counts,
        drifts: r.drifts.map((d) => ({ id: d.id, key: d.key, displayName: d.displayName, tag: d.tag, before: d.before, after: d.after })),
      };
    });
    res.json({ reviews, queries: Object.fromEntries(QUERIES_USED.map((q) => [q, loadQuery(q)])) });
  });

  app.get("/api/review/:base/:head", (req, res) => {
    const s = need(res);
    if (!s) return;
    res.json(readReview(s, String(req.params.base), String(req.params.head)));
  });

  app.get("/api/drift/:id", (req, res) => {
    const s = need(res);
    if (!s) return;
    const id = String(req.params.id);
    const [pair] = id.split(":");
    const [base, head] = pair.split("..");
    const review = readReview(s, base, head);
    const drift = review.drifts.find((d) => d.id === id);
    const graph = driftGraph(s, id);
    if (!drift || !graph) {
      res.status(404).json({ error: `No drift ${id}` });
      return;
    }
    res.json({ drift, base, head, notAffected: review.notAffected, counts: review.counts, ...graph });
  });

  app.get("/api/snippet", (req: Request, res: Response) => {
    const out = snippet(String(req.query.snapshot ?? ""), String(req.query.path ?? ""), Number(req.query.line ?? 1));
    if (!out) {
      res.status(404).json({ error: "Only files inside examples/ can be shown." });
      return;
    }
    res.json(out);
  });

  app.get("/api/presets", (_req, res) => {
    res.json(listPresets());
  });

  app.post("/api/cypher", async (req, res) => {
    const s = need(res);
    if (!s) return;
    const cypher = String(req.body?.query ?? "").trim();
    if (!cypher) {
      res.status(400).json({ error: "Empty query." });
      return;
    }
    const w = writeClause(cypher);
    if (w) {
      res.status(400).json({ error: `Refused: ${w} would write. The viewer is read-only.`, code: "ReadOnly" });
      return;
    }
    const started = Date.now();
    try {
      const result = await Promise.race([
        s.conn.queryAsync(cypher),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS)),
      ]);
      const g = result.graph();
      res.json({
        columns: result.columns,
        rows: result.rows.slice(0, ROW_LIMIT),
        truncated: result.rows.length > ROW_LIMIT,
        total: result.rows.length,
        ms: Date.now() - started,
        elements: [...g.nodes.map((n) => nodeEl(n)), ...g.relationships.map(relEl)],
      });
    } catch (err) {
      const e = err as { message?: string; code?: string | null };
      res.status(400).json({ error: e.message ?? String(err), code: e.code ?? null });
    }
  });

  app.get("/api/store", (_req, res) => {
    const s = need(res);
    if (!s) return;
    res.json(storeInfo(s));
  });

  return { app, storeError };
}

export async function runViewer(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv);
  const port = Number(flags.port ?? 4317);
  const { app, storeError } = createApp(typeof flags.store === "string" ? flags.store : DEFAULT_STORE);
  if (storeError) console.error(`${storeError}\n(the viewer will show this message until the store exists)`);
  await new Promise<void>((done) => {
    const server = app.listen(port, () => done());
    server.on("error", (err: NodeJS.ErrnoException) => {
      console.error(err.code === "EADDRINUSE" ? `Port ${port} is busy. Try: npm run viewer -- --port 4318` : err.message);
      process.exit(2);
    });
  });
  console.log(`Contract Drift viewer on http://localhost:${port}  (store opened read-only; Ctrl+C to stop)`);
  return -1;
}

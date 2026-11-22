import express, { type Request, type Response } from "express";
import { join } from "node:path";
import { driftGraph } from "./driftGraph.ts";
import { graphElements } from "./elements.ts";
import { snippet } from "./snippet.ts";
import { storeInfo } from "./storeInfo.ts";
import { parseArgs } from "../cli/args.ts";
import { listPresets } from "../relate/presets.ts";
import { reviewQueryTexts } from "../review/queries.ts";
import { readMeta } from "../graph/build.ts";
import { DEFAULT_STORE, describeError, openStore, ROOT, type Store } from "../relate/store.ts";
import { writeClause } from "../relate/guard.ts";
import { compareReviews, repairMarkdown } from '../review/compare.ts';
import { formatMarkdown } from '../cli/format/markdown.ts';
import { readReview } from "../review/read.ts";
import { SNAPSHOT_TITLES } from "../extract/index.ts";

const EXAMPLES = join(ROOT, "examples");
const ROW_LIMIT = 500;
const TIMEOUT_MS = 2000;

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
    res.json({ reviews, queries: reviewQueryTexts() });
  });

  app.get('/api/repair', (req, res) => {
    const s = need(res); if (!s) return;
    const base = String(req.query.base ?? '');
    const before = String(req.query.before ?? ''); const after = String(req.query.after ?? '');
    const pairs = readMeta(s)?.comparisons ?? [];
    if (![before, after].every(head => pairs.some(c => c.base === base && c.head === head))) {
      res.status(404).json({error:'Unknown comparison pair. Select two cases sharing the same base.'}); return;
    }
    const repair = compareReviews(readReview(s,base,before), readReview(s,base,after));
    if (req.query.format === 'markdown') res.type('text/markdown').send(repairMarkdown(repair));
    else res.json(repair);
  });

  app.get('/api/export/:base/:head', (req, res) => {
    const s = need(res); if (!s) return;
    const base = String(req.params.base), head = String(req.params.head);
    if (!readMeta(s)?.comparisons.some(c => c.base === base && c.head === head)) {
      res.status(404).json({error:'Unknown comparison pair.'}); return;
    }
    const review = readReview(s,base,head);
    if (req.query.format === 'json') res.json(review);
    else res.type('text/markdown').send(formatMarkdown(review));
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
        elements: graphElements(g),
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

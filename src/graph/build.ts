import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { extractSnapshot } from "../extract/index.ts";
import { computeReview } from "../review/index.ts";
import { openStore, ROOT, type Store } from "../relate/store.ts";
import { applySchema } from "./schema.ts";
import { loadSnapshot } from "./load.ts";

export const FIXTURE_DIR = join(ROOT, "examples/shop-monorepo/snapshots");
export const TOOL_VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version as string;

/** Snapshot folders of the fixture: base first, then heads in name order. */
export function fixtureSnapshots(dir = FIXTURE_DIR): string[] {
  const all = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
  return ["base", ...all.filter((n) => n !== "base").sort()].filter((n) => all.includes(n));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Content fingerprint of everything that determines the store: fixture files, queries, and the analyzer
 * source. The .rl file is not byte-deterministic (RESEARCH gotcha 4), so we compare this instead of bytes.
 */
export function fingerprint(): string {
  const h = createHash("sha1").update(`contract-drift@${TOOL_VERSION}\n`);
  const files = [FIXTURE_DIR, join(ROOT, "queries"), join(ROOT, "src/extract"), join(ROOT, "src/graph"), join(ROOT, "src/review")]
    .flatMap((d) => walk(d))
    .map((p) => relative(ROOT, p).split(sep).join("/"))
    .sort();
  for (const f of files) {
    // Normalise line endings so a Windows checkout gets the same fingerprint.
    const text = readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
    h.update(`${f}\0${createHash("sha1").update(text).digest("hex")}\n`);
  }
  return h.digest("hex");
}

export function readMeta(store: Store): { fingerprint: string; toolVersion: string; snapshots: string[]; builtAt: string } | null {
  const rows = store.query<Record<string, unknown>>(
    "MATCH (m:Meta {key:'build'}) RETURN m.fingerprint AS fingerprint, m.toolVersion AS toolVersion, m.snapshots AS snapshots, m.builtAt AS builtAt",
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    fingerprint: String(r.fingerprint),
    toolVersion: String(r.toolVersion),
    snapshots: (r.snapshots as string[]) ?? [],
    builtAt: String(r.builtAt ?? ""),
  };
}

/** Load snapshot folders into an open writable store and compute every head-vs-base review. */
export function populate(store: Store, dirs: { id: string; dir: string }[], log: (s: string) => void = () => {}): void {
  applySchema(store);
  for (const { id, dir } of dirs) {
    const t = Date.now();
    const data = extractSnapshot(dir, id);
    loadSnapshot(store, data);
    log(`  loaded ${id.padEnd(16)} ${String(data.files.length).padStart(3)} files  ${String(data.fields.length).padStart(2)} contract fields  ${String(data.usages.length).padStart(2)} usages  (${Date.now() - t} ms)`);
  }
  const [base, ...heads] = dirs.map((d) => d.id);
  for (const head of [base, ...heads]) {
    const n = store.tx(() => computeReview(store, base, head));
    log(`  reviewed ${base}..${head}: ${n} drift${n === 1 ? "" : "s"}`);
  }
}

/** Build the store at `target`: write a scratch file, checkpoint, then rename over the target. */
export function buildStore(target: string, log: (s: string) => void = () => {}): void {
  const existing = lstatSync(target, { throwIfNoEntry: false });
  if (existing && !existing.isFile()) throw new Error(`Store target must be a regular file: ${target}`);

  const dir = mkdtempSync(join(dirname(target), ".contract-drift-"));
  const scratch = join(dir, "store.rl");
  try {
    const store = openStore(scratch);
    const ids = fixtureSnapshots();
    populate(store, ids.map((id) => ({ id, dir: join(FIXTURE_DIR, id) })), log);
    store.query("MERGE (m:Meta {key:'build'}) SET m.fingerprint = $fp, m.toolVersion = $v, m.snapshots = $s, m.builtAt = $at", {
      fp: fingerprint(),
      v: TOOL_VERSION,
      s: ids,
      at: new Date().toISOString(),
    });
    store.db.checkpoint();
    renameSync(scratch, target);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

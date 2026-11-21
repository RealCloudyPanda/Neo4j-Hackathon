import { closeSync, existsSync, openSync, rmSync, statSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { populate, readMeta, TOOL_VERSION } from "../graph/build.ts";
import { DEFAULT_STORE, describeError, loadQuery, openStore, ROOT, type Store } from "../relate/store.ts";
import { compareReviews, repairMarkdown } from '../review/compare.ts';
import { readReview } from "../review/read.ts";
import { CASE_CATALOG } from '../graph/catalog.ts';
import { parseArgs } from "./args.ts";
import { formatJson } from "./format/json.ts";
import { formatMarkdown } from "./format/markdown.ts";
import { formatText } from "./format/text.ts";

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

export const QUERIES_USED = ["drift", "impact", "tests"];

export async function runAnalyze(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv, ["json", "markdown", "no-color", "show-cypher"]);
  const selected = CASE_CATALOG.find(c => c.head === String(flags.case ?? flags.head ?? 'pr-duration-ms'));
  const baseArg = String(flags.base ?? selected?.base ?? "base");
  const headArg = String(flags.case ?? flags.head ?? "pr-duration-ms");
  const storeArg = typeof flags.store === "string" ? flags.store : undefined;

  let store: Store;
  let base = baseArg;
  let head = headArg;
  let storeLabel: string;
  try {
    if (isDir(baseArg) && isDir(headArg)) {
      base = basename(resolve(baseArg));
      head = basename(resolve(headArg));
      if (base === head) [base, head] = ["base", "head"];
      const path = storeArg ?? ":memory:";
      const persisted = path !== ":memory:";
      if (persisted) {
        try {
          closeSync(openSync(path, "wx"));
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "EEXIST") {
            throw new Error(`Store already exists at ${path}. Choose a new file for this folder comparison.`);
          }
          throw err;
        }
      }
      try {
        store = openStore(path);
        populate(store, [
          { id: base, dir: baseArg },
          { id: head, dir: headArg },
        ]);
        if (persisted) {
          store.query(
            "CREATE (:Meta {key:'build', fingerprint:'', toolVersion:$version, snapshots:$snapshots, comparisons:$pairs, builtAt:$at})",
            { pairs: JSON.stringify([{base,head}]), version: TOOL_VERSION, snapshots: [base, head], at: new Date().toISOString() },
          );
          store.db.checkpoint();
        }
      } catch (err) {
        if (persisted) rmSync(path, { force: true });
        throw err;
      }
      storeLabel = persisted ? `${path} (new)` : "in memory (folders)";
    } else {
      const path = storeArg ?? DEFAULT_STORE;
      store = openStore(path, { readOnly: true });
      storeLabel = `${relative(ROOT, resolve(path)) || path} (read-only)`;
      const known = readMeta(store)?.snapshots ?? [];
      for (const s of [base, head]) {
        if (!known.includes(s)) {
          console.error(`Unknown snapshot "${s}". The store has: ${known.join(", ")}. Or pass two folders.`);
          return 2;
        }
      }
      if (!readMeta(store)?.comparisons.some(c => c.base === base && c.head === head)) {
        console.error(`Comparison "${base}..${head}" is not saved. Pass two folders or select an authored --case.`);
        return 2;
      }
    }
  } catch (err) {
    console.error(describeError(err));
    return 2;
  }

  const review = readReview(store, base, head);
  if (typeof flags['repair-from'] === 'string') {
    const previous = flags['repair-from'];
    if (!readMeta(store)?.comparisons.some(c => c.base === base && c.head === previous)) {
      console.error(`No saved comparison ${base}..${previous} for repair comparison.`); return 2;
    }
    const repair = compareReviews(readReview(store, base, previous), review);
    process.stdout.write((flags.json ? JSON.stringify(repair, null, 2) : repairMarkdown(repair)) + '\n');
    return repair.remaining > 0 ? 1 : 0;
  }
  const cypher = QUERIES_USED.map((q) => loadQuery(q));
  if (flags.json) process.stdout.write(formatJson(review, { store: storeLabel, cypher }) + "\n");
  else if (flags.markdown) process.stdout.write(formatMarkdown(review) + "\n");
  else
    process.stdout.write(
      formatText(review, {
        color: !flags["no-color"] && process.stdout.isTTY === true && !process.env.NO_COLOR,
        storeLabel,
        cypher: flags["show-cypher"] ? cypher : undefined,
      }),
    );
  return review.counts.MISMATCH > 0 ? 1 : 0;
}

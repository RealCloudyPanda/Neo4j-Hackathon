import { existsSync, statSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { populate, readMeta } from "../graph/build.ts";
import { DEFAULT_STORE, describeError, loadQuery, openStore, ROOT, type Store } from "../relate/store.ts";
import { readReview } from "../review/read.ts";
import { parseArgs } from "./args.ts";
import { formatJson } from "./format/json.ts";
import { formatMarkdown } from "./format/markdown.ts";
import { formatText } from "./format/text.ts";

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

export const QUERIES_USED = ["drift", "impact", "tests"];

/**
 * Reader process. Snapshot names are read from the committed store (read-only). Two folders are
 * analyzed in a fresh store (in memory, or --store <file> if given), so any two checkouts work.
 */
export async function runAnalyze(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv, ["json", "markdown", "no-color", "show-cypher"]);
  const baseArg = String(flags.base ?? "base");
  const headArg = String(flags.head ?? "pr-duration-ms");
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
      store = openStore(storeArg ?? ":memory:");
      populate(store, [
        { id: base, dir: baseArg },
        { id: head, dir: headArg },
      ]);
      storeLabel = storeArg ? `${storeArg} (new)` : "in memory (folders)";
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
    }
  } catch (err) {
    console.error(describeError(err));
    return 2;
  }

  const review = readReview(store, base, head);
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

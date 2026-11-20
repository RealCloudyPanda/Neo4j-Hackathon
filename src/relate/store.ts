/**
 * The only place that touches @relate/relate directly.
 *
 * Relate gotchas this module designs around (docs/RESEARCH.md):
 *  - there is no Database.close(): a second open of the same file in one process fails, so each
 *    file path is opened at most once per process and the handle is cached;
 *  - one writer per store across processes: the builder writes and exits, everything else opens
 *    read-only;
 *  - lock and IO failures surface as an opaque "internal error", so we add a plain-English hint.
 */
import { Database, RelateError, type Connection, type ParamValue, type Row } from "@relate/relate";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_STORE = join(ROOT, "data/contract-drift.rl");
export const QUERIES_DIR = join(ROOT, "queries");

export type Params = { [name: string]: ParamValue };

export interface Store {
  path: string;
  readOnly: boolean;
  db: Database;
  conn: Connection;
  query<T extends Row = Row>(cypher: string, params?: Params): T[];
  queryAsync<T extends Row = Row>(cypher: string, params?: Params): Promise<T[]>;
  /** Run fn inside one explicit transaction (commit on success, rollback on throw). */
  tx<T>(fn: () => T): T;
}

export class StoreError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
    readonly code?: string | null,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

const cache = new Map<string, Store>();

export function openStore(path: string, opts: { readOnly?: boolean } = {}): Store {
  const readOnly = opts.readOnly ?? false;
  const memory = path === ":memory:";
  const abs = memory ? path : resolve(path);
  if (!memory) {
    const cached = cache.get(abs);
    if (cached) {
      if (cached.readOnly && !readOnly) {
        throw new StoreError(
          `The store ${abs} is already open read-only in this process.`,
          "Relate has no close(); write from a separate process (npm run build:graph).",
        );
      }
      return cached;
    }
    if (readOnly && !existsSync(abs)) {
      throw new StoreError(`No store at ${abs}.`, "Run `npm run build:graph` to create it.");
    }
  }

  let db: Database;
  try {
    db = Database.open(abs, readOnly ? { readOnly: true } : undefined);
  } catch (err) {
    throw wrapOpenError(err, abs);
  }
  const conn = db.connect();
  const store: Store = {
    path: abs,
    readOnly,
    db,
    conn,
    query: (cypher, params) => conn.query(cypher, params ?? {}).rows as never,
    queryAsync: async (cypher, params) => (await conn.queryAsync(cypher, params ?? {})).rows as never,
    tx(fn) {
      conn.begin();
      try {
        const out = fn();
        conn.commit();
        return out;
      } catch (err) {
        try {
          conn.rollback();
        } catch {
          /* already failed */
        }
        throw err;
      }
    },
  };
  if (!memory) cache.set(abs, store);
  return store;
}

function wrapOpenError(err: unknown, path: string): StoreError {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof RelateError ? err.code : null;
  return new StoreError(
    `Could not open the Relate store ${path}: ${msg}`,
    "Another process may hold the store (Relate allows one writer, and no readers while it writes). " +
      "Stop the viewer or any running build, then retry.",
    code,
  );
}

/** Format any error for the terminal, with the hint and Relate code when present. */
export function describeError(err: unknown): string {
  if (err instanceof StoreError) {
    return [err.message, err.hint ? `hint: ${err.hint}` : "", err.code ? `code: ${err.code}` : ""]
      .filter(Boolean)
      .join("\n");
  }
  if (err instanceof RelateError) return `${err.message}${err.code ? ` (${err.code})` : ""}`;
  return err instanceof Error ? err.message : String(err);
}

const queryCache = new Map<string, string>();

/** Load a query from queries/<name>.cypher (comments kept; Relate accepts // comments). */
export function loadQuery(name: string): string {
  let text = queryCache.get(name);
  if (text === undefined) {
    text = readFileSync(join(QUERIES_DIR, `${name}.cypher`), "utf8").trim();
    queryCache.set(name, text);
  }
  return text;
}

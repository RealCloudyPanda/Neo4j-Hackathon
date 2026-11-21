import { existsSync, statSync } from "node:fs";
import { relative } from "node:path";
import { buildStore, fingerprint, readMeta } from "../graph/build.ts";
import { DEFAULT_STORE, describeError, openStore, ROOT } from "../relate/store.ts";
import { parseArgs } from "./args.ts";

export async function runBuild(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv, ["force"]);
  const target = typeof flags.store === "string" ? flags.store : DEFAULT_STORE;
  const shown = relative(ROOT, target) || target;
  try {
    const fp = fingerprint();
    if (!flags.force && existsSync(target)) {
      const meta = readMeta(openStore(target, { readOnly: true }));
      if (meta?.fingerprint === fp) {
        console.log(`store up to date: ${shown} (fingerprint ${fp.slice(0, 12)}, built ${meta.builtAt})`);
        return 0;
      }
      console.log(`fixture or analyzer changed since the last build; rebuilding ${shown}`);
    } else console.log(`building ${shown}`);
    const t = Date.now();
    buildStore(target, (s) => console.log(s));
    console.log(`wrote ${shown} (${(statSync(target).size / 1024).toFixed(0)} KB) in ${Date.now() - t} ms, fingerprint ${fp.slice(0, 12)}`);
    return 0;
  } catch (err) {
    console.error(describeError(err));
    return 2;
  }
}

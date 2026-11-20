import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "../src/relate/store.ts";

const tsc = join(ROOT, "node_modules/typescript/bin/tsc");

for (const snap of ["base", "pr-duration-ms", "pr-weight-kg"]) {
  test(`fixture snapshot ${snap} type-checks`, () => {
    const r = spawnSync(process.execPath, [tsc, "-p", join(ROOT, "examples/shop-monorepo/snapshots", snap), "--noEmit"], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const entry = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));
const committed = new URL("../data/contract-drift.rl", import.meta.url);

test("the committed Relate file opens by itself and the build skips it", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "contract-drift-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "contract-drift.rl");
  copyFileSync(committed, path);

  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", entry, ...args, "--store", path], {
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.ifError(result.error);
    assert.equal(result.stderr, "");
    return result;
  };

  const analyze = run("analyze", "--json");
  assert.equal(analyze.status, 1);
  const report = JSON.parse(analyze.stdout);
  assert.equal(report.drifts[0].key, "OrderSummary.duration");
  assert.ok(report.drifts[0].entries.some((entry: { path: string; verdict: string; inDiff: boolean }) =>
    entry.path === "apps/worker/src/sla.test.ts" && entry.verdict === "TEST" && !entry.inDiff,
  ));

  const build = run("build");
  assert.equal(build.status, 0);
  assert.match(build.stdout, /^store up to date:/);
  assert.deepEqual(readFileSync(path), readFileSync(committed));
});

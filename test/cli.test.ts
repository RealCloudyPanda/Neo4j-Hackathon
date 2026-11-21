import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../bin/contract-drift.js", import.meta.url));

test("analyze prints the reviewer shortlist in rank order", () => {
  const result = spawnSync(process.execPath, [cli, "analyze", "--no-color"], {
    cwd: tmpdir(),
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.stderr, "");
  assert.equal(result.status, 1);
  const expected = readFileSync(new URL("./fixtures/analyze.txt", import.meta.url), "utf8");
  assert.equal(result.stdout.replace(/[ \t]+$/gm, ""), expected.replace(/\r\n/g, "\n"));
});

test("analyze rejects a snapshot pair with no persisted comparison", () => {
  const result = spawnSync(process.execPath, [cli, "analyze", "--base", "pr-duration-ms", "--head", "pr-weight-kg"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Comparison .* is not saved/);
});

test("folder analyze creates a reusable store and protects existing files", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "contract-drift-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = join(dir, "review.rl");
  const fixtures = new URL("../examples/shop-monorepo/snapshots/", import.meta.url);
  const base = fileURLToPath(new URL("base", fixtures));
  const head = fileURLToPath(new URL("pr-duration-ms", fixtures));
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, "analyze", "--json", "--store", store, ...args], {
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.ifError(result.error);
    return result;
  };
  const initial = run("--base", base, "--head", head);
  assert.equal(initial.status, 1, initial.stderr);
  const bytes = readFileSync(store);
  const reopened = run();
  assert.equal(reopened.status, 1, reopened.stderr);
  assert.deepEqual(JSON.parse(reopened.stdout).drifts, JSON.parse(initial.stdout).drifts);
  const duplicate = run("--base", base, "--head", head);
  assert.equal(duplicate.status, 2);
  assert.match(duplicate.stderr, /Store already exists/);
  assert.deepEqual(readFileSync(store), bytes);
});

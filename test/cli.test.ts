import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../bin/contract-drift.js", import.meta.url));

test("analyze prints the reviewer shortlist in rank order", () => {
  const result = spawnSync(process.execPath, [cli, "analyze", "--no-color"], {
    cwd: tmpdir(),
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.equal(result.stderr, "");
  assert.equal(result.status, 1);
  const expected = readFileSync(new URL("./fixtures/analyze.txt", import.meta.url), "utf8");
  assert.equal(result.stdout.replace(/[ \t]+$/gm, ""), expected.replace(/\r\n/g, "\n"));
});

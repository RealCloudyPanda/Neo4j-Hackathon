import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "../relate/store.ts";
import { runAnalyze } from "./analyze.ts";

export async function runDemo(argv: string[]): Promise<number> {
  const build = spawnSync(process.execPath, ["--import", "tsx", join(ROOT, "src/cli/index.ts"), "build"], { stdio: "inherit", cwd: ROOT });
  if (build.status !== 0) return build.status ?? 2;
  await runAnalyze([]);
  const { runViewer } = await import("../viewer/server.ts");
  return runViewer(argv);
}

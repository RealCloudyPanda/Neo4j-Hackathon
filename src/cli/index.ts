#!/usr/bin/env node
export const HELP = `Contract Drift: catch the PR that passes TypeScript but changes what an API field means.

Usage
  contract-drift analyze [--base <snapshot|dir>] [--head <snapshot|dir>] [--store <file>]
                         [--case <authored-head>] [--repair-from <previous-head>]
                         [--json | --markdown] [--no-color] [--show-cypher]
  contract-drift build [--force] [--store <file>]
  contract-drift cypher "<read-only query>" | --preset <name> | --list-presets
  contract-drift viewer [--port 4317]
  contract-drift demo

npm scripts
  npm run analyze               review base → pr-duration-ms from the committed store
  npm run build:graph           rebuild data/contract-drift.rl if the fixture changed
  npm run cypher -- "<query>"   read-only Cypher against the store
  npm run viewer                open the graph viewer on http://localhost:4317
  npm run demo                  build:graph → analyze → viewer

Exit codes
  Repair: 0 no remaining MISMATCH; 1 remaining MISMATCH
  0  no MISMATCH found     1  at least one MISMATCH     2  usage or store error
`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      process.stdout.write(HELP);
      return 0;
    case "analyze":
      return (await import("./analyze.ts")).runAnalyze(rest);
    case "build":
      return (await import("./build.ts")).runBuild(rest);
    case "cypher":
      return (await import("./cypher.ts")).runCypher(rest);
    case "viewer":
      return (await import("../viewer/server.ts")).runViewer(rest);
    case "demo":
      return (await import("./demo.ts")).runDemo(rest);
    default:
      process.stderr.write(`Unknown command "${cmd}".\n\n${HELP}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`contract-drift: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  },
);

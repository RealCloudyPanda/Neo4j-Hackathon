export function parseArgs(argv: string[], booleans: string[] = []): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) flags[k] = v;
      else if (booleans.includes(k) || k.startsWith("no-") || i + 1 >= argv.length || argv[i + 1].startsWith("--")) flags[k] = true;
      else flags[k] = argv[++i];
    } else positional.push(a);
  }
  return { flags, positional };
}

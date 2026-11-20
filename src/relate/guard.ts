/** Refuse write clauses outside string literals and comments. The store is also opened read-only. */
const WRITE = /\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP|LOAD|FOREACH)\b/i;

export function stripStrings(cypher: string): string {
  return cypher
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`/g, "''");
}

export function writeClause(cypher: string): string | null {
  const m = WRITE.exec(stripStrings(cypher));
  return m ? m[1].toUpperCase() : null;
}

import type { SnapshotData } from "../extract/types.ts";
import type { Params, Store } from "../relate/store.ts";

const tagProps = (t: { unit?: string; format?: string; tz?: string }) => ({
  unit: t.unit ?? null,
  format: t.format ?? null,
  tz: t.tz ?? null,
});

export const fileId = (snap: string, path: string) => `${snap}:${path}`;
export const fvId = (snap: string, key: string) => `${snap}:${key}`;

export function loadSnapshot(store: Store, s: SnapshotData): void {
  const snap = s.id;
  const testPaths = new Set(s.files.filter((f) => f.isTest).map((f) => f.path));
  const run = (cypher: string, rows: unknown[]) => {
    if (rows.length) store.query(cypher, { rows } as Params);
  };

  store.tx(() => {
    store.query("MERGE (s:Snapshot {id:$id}) SET s.title = $title, s.fileCount = $n", {
      id: snap,
      title: s.title,
      n: s.files.length,
    });

    run(
      `UNWIND $rows AS r
       MATCH (s:Snapshot {id: r.snapshot})
       MERGE (f:File {id: r.id})
       SET f.snapshot = r.snapshot, f.path = r.path, f.package = r.package, f.isTest = r.isTest, f.hash = r.hash
       MERGE (s)-[:CONTAINS]->(f)`,
      s.files.map((f) => ({ ...f, id: fileId(snap, f.path), snapshot: snap })),
    );

    run(
      `UNWIND $rows AS r
       MATCH (a:File {id: r.from}), (b:File {id: r.to})
       MERGE (a)-[i:IMPORTS]->(b) SET i.specifier = r.specifier`,
      s.imports.map((i) => ({ from: fileId(snap, i.from), to: fileId(snap, i.to), specifier: i.specifier })),
    );

    run(
      `UNWIND $rows AS r
       MERGE (f:Field {key: r.key})
       SET f.displayName = r.displayName
       MERGE (v:FieldVersion {id: r.id})
       SET v.snapshot = r.snapshot, v.key = r.key, v.displayName = r.displayName, v.type = r.type, v.unit = r.unit, v.format = r.format,
           v.tz = r.tz, v.doc = r.doc, v.path = r.path, v.line = r.line
       MERGE (v)-[:VERSION_OF]->(f)
       WITH v, r
       MATCH (file:File {id: r.fileId})
       MERGE (v)-[:DECLARED_IN]->(file)`,
      s.fields.map((f) => ({
        ...f,
        ...tagProps(f),
        id: fvId(snap, f.key),
        snapshot: snap,
        fileId: fileId(snap, f.path),
      })),
    );

    run(
      `UNWIND $rows AS r
       MATCH (v:FieldVersion {id: r.fv}), (file:File {id: r.fileId})
       MERGE (p:Producer {id: r.id})
       SET p.snapshot = r.snapshot, p.name = r.name, p.key = r.key, p.path = r.path, p.line = r.line,
           p.code = r.code, p.inTest = r.inTest
       MERGE (p)-[:WRITES]->(v)
       MERGE (p)-[:IN_FILE]->(file)`,
      s.producers.map((p) => ({
        ...p,
        id: `${snap}:${p.path}:${p.line}:${p.key}`,
        snapshot: snap,
        fv: fvId(snap, p.key),
        fileId: fileId(snap, p.path),
        inTest: testPaths.has(p.path),
      })),
    );

    const usageRows = s.usages.map((u) => ({
      id: `${snap}:${u.path}:${u.line}:${u.col}`,
      snapshot: snap,
      key: u.key,
      path: u.path,
      line: u.line,
      col: u.col,
      kind: u.kind,
      flowNote: u.flowNote ?? null,
      code: u.code,
      inTest: testPaths.has(u.path),
      fv: fvId(snap, u.key),
      fileId: fileId(snap, u.path),
    }));
    run(
      `UNWIND $rows AS r
       MATCH (v:FieldVersion {id: r.fv}), (file:File {id: r.fileId})
       MERGE (u:Usage {id: r.id})
       SET u.snapshot = r.snapshot, u.key = r.key, u.path = r.path, u.line = r.line, u.col = r.col,
           u.flowNote = r.flowNote, u.kind = r.kind, u.code = r.code, u.inTest = r.inTest
       MERGE (v)-[:READ_AT]->(u)
       MERGE (u)-[:IN_FILE]->(file)`,
      usageRows,
    );

    const flows = s.usages.flatMap((u) => {
      if (!u.passesTo) return [];
      const { fn, param, argIndex } = u.passesTo;
      const fnId = `${snap}:${fn.path}:${fn.name}`;
      return [
        {
          usage: `${snap}:${u.path}:${u.line}:${u.col}`,
          fnId,
          fnName: fn.name,
          fnPath: fn.path,
          fnLine: fn.line,
          fnFile: fileId(snap, fn.path),
          paramId: `${fnId}:${param.name}`,
          paramName: param.name,
          paramIndex: param.index,
          paramLine: param.line,
          ...tagProps(param),
          argIndex,
          snapshot: snap,
        },
      ];
    });
    run(
      `UNWIND $rows AS r
       MATCH (u:Usage {id: r.usage}), (file:File {id: r.fnFile})
       MERGE (fn:Function {id: r.fnId})
       SET fn.snapshot = r.snapshot, fn.name = r.fnName, fn.path = r.fnPath, fn.line = r.fnLine
       MERGE (fn)-[:IN_FILE]->(file)
       MERGE (pm:Param {id: r.paramId})
       SET pm.snapshot = r.snapshot, pm.name = r.paramName, pm.index = r.paramIndex, pm.unit = r.unit,
           pm.format = r.format, pm.tz = r.tz, pm.path = r.fnPath, pm.line = r.paramLine
       MERGE (pm)-[:PARAM_OF]->(fn)
       MERGE (u)-[pt:PASSES_TO]->(pm) SET pt.argIndex = r.argIndex`,
      flows,
    );

    run(
      `UNWIND $rows AS r
       MATCH (a:FieldVersion {id: r.from}), (b:FieldVersion {id: r.to})
       MERGE (a)-[l:LINKED_TO]->(b)
       SET l.source = 'manifest', l.via = r.via, l.reason = r.reason`,
      s.links.map((l) => ({ from: fvId(snap, l.from), to: fvId(snap, l.to), via: l.via, reason: l.reason })),
    );
  });
}

export function markInDiff(store: Store, base: string, head: string): void {
  store.query(
    `MATCH (:Snapshot {id:$head})-[:CONTAINS]->(h:File)
     OPTIONAL MATCH (:Snapshot {id:$base})-[:CONTAINS]->(b:File {path: h.path})
     SET h.inDiff = (b IS NULL OR b.hash <> h.hash)`,
    { base, head },
  );
}

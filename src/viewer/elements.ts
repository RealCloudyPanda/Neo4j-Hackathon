import type { NodeValue, RelationshipValue } from "@relate/relate";

export type El = { data: Record<string, unknown>; classes?: string };

function shortLabel(n: NodeValue): string {
  const p = n.properties;
  switch (n.labels[0]) {
    case "Drift":
      return `${p.displayName ?? String(p.key).split("#").pop()}\n@${p.tag} ${p.before} → ${p.after}`;
    case "FieldVersion":
      return `${p.displayName ?? String(p.key).split("#").pop()}\n${p.unit ? `@unit ${p.unit}` : p.format ? `@format ${p.format}` : ""}`;
    case "Usage":
      return `${String(p.path).split("/").pop()}:${p.line}`;
    case "Param":
      return `${p.name}${p.unit ? ` @unit ${p.unit}` : ""}`;
    case "Function":
      return `${p.name}()`;
    case "File":
      return String(p.path).split("/").pop() ?? String(p.path);
    default:
      return String(p.id ?? p.key ?? p.name ?? n.labels[0]);
  }
}

export function nodeEl(n: NodeValue, extra: Record<string, unknown> = {}): El {
  return {
    data: { id: n.elementId, label: shortLabel(n), kind: n.labels[0], props: n.properties, ...extra },
    classes: n.labels[0].toLowerCase(),
  };
}

export function relEl(r: RelationshipValue): El {
  return {
    data: {
      id: r.elementId,
      source: r.startElementId,
      target: r.endElementId,
      type: r.type,
      label: r.type === "LINKED_TO" ? `hidden link · ${r.properties.via}` : r.type,
    },
    classes: r.type.toLowerCase(),
  };
}

export function graphElements(graph: { nodes: NodeValue[]; relationships: RelationshipValue[] }): El[] {
  return [...graph.nodes.map((n) => nodeEl(n)), ...graph.relationships.map(relEl)];
}

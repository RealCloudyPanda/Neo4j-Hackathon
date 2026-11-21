import { Node, SyntaxKind, type JSDocableNode, type Project, type PropertySignature } from "ts-morph";
import { isInside, relPath } from "./project.ts";
import { MEANING_TAGS, type FieldVersionRec, type MeaningTag, type Tags } from "./types.ts";

/** Read @unit / @format / @tz from JSDoc blocks. Only explicit tags count (ADR 0002). */
export function tagsFromJsDoc(node: JSDocableNode): Tags {
  const tags: Tags = {};
  for (const doc of node.getJsDocs()) {
    for (const tag of doc.getTags()) {
      const name = tag.getTagName() as MeaningTag;
      if (!MEANING_TAGS.includes(name)) continue;
      const value = String(tag.getCommentText() ?? "").trim().split(/\s+/)[0];
      if (value) tags[name] = value;
    }
  }
  return tags;
}

/** Read tags from an inline comment such as `/** @unit seconds *\/ seconds: number`. */
export function tagsFromText(text: string): Tags {
  const tags: Tags = {};
  for (const t of MEANING_TAGS) {
    const m = new RegExp(`@${t}\\s+([^\\s*]+)`).exec(text);
    if (m) tags[t] = m[1];
  }
  return tags;
}

export const hasTags = (t: Tags): boolean => MEANING_TAGS.some((k) => t[k] !== undefined);

/** Owner name of a property signature: interface name or type-alias name. */
export function ownerName(prop: PropertySignature): string | undefined {
  const parent = prop.getParent();
  if (Node.isInterfaceDeclaration(parent)) return parent.getName();
  if (Node.isTypeLiteral(parent)) {
    const alias = parent.getParent();
    if (Node.isTypeAliasDeclaration(alias)) return alias.getName();
  }
  return undefined;
}

export interface FieldDecl {
  rec: FieldVersionRec;
  node: PropertySignature;
}

/** Every interface / type-literal property carrying a meaning tag is a contract field. */
export function extractFields(project: Project, dir: string): FieldDecl[] {
  const out: FieldDecl[] = [];
  for (const sf of project.getSourceFiles()) {
    if (!isInside(dir, sf)) continue;
    for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
      const owner = ownerName(prop);
      if (!owner) continue;
      const tags = tagsFromJsDoc(prop);

      const doc = prop
        .getJsDocs()
        .map((d) => d.getDescription().trim())
        .filter(Boolean)
        .join(" ");
      out.push({
        node: prop,
        rec: {
          key: `${relPath(dir, sf)}#${owner}.${prop.getName()}`,
          displayName: `${owner}.${prop.getName()}`,
          type: prop.getTypeNode()?.getText() ?? prop.getType().getText(),
          doc,
          path: relPath(dir, sf),
          line: prop.getStartLineNumber(),
          ...tags,
        },
      });
    }
  }
  return out.sort((a, b) => a.rec.key.localeCompare(b.rec.key));
}

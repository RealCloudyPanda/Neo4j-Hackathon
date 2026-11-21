import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type CallExpression,
  type Expression,
  type ParameterDeclaration,
  type SourceFile,
} from "ts-morph";
import type { FieldDecl } from "./fields.ts";
import { tagsFromText } from "./fields.ts";
import { isInside, relPath } from "./project.ts";
import type { FunctionRec, ParamRec, ProducerRec, Tags, UsageRec } from "./types.ts";

const lineText = (sf: SourceFile, line: number): string => (sf.getFullText().split("\n")[line - 1] ?? "").trim();

/**
 * Walk every reference of every contract field and classify it by its parent node:
 * object-literal property → Producer (writes the field); property access / destructure → Usage (reads it).
 * A read that is a *direct* argument of a call is followed to the callee's parameter (RESEARCH §2).
 */
export function extractUsages(fields: FieldDecl[], dir: string): { producers: ProducerRec[]; usages: UsageRec[] } {
  const producers: ProducerRec[] = [];
  const usages: UsageRec[] = [];
  const seen = new Set<string>();

  for (const { rec, node } of fields) {
    for (const ref of node.findReferencesAsNodes()) {
      const sf = ref.getSourceFile();
      if (!isInside(dir, sf)) continue;
      const path = relPath(dir, sf);
      const line = ref.getStartLineNumber();
      const col = ref.getStart() - sf.compilerNode.getLineStarts()[line - 1] + 1;
      const id = `${rec.key}@${path}:${line}:${col}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const parent = ref.getParent();
      if (!parent) continue;

      if (Node.isPropertyAssignment(parent) || Node.isShorthandPropertyAssignment(parent)) {
        if (parent.getNameNode() !== ref) continue;
        producers.push({ key: rec.key, name: producerName(parent), path, line, code: lineText(sf, line) });
        continue;
      }

      let read: Expression | undefined;
      let kind: UsageRec["kind"] = "read";
      if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === ref) read = parent;
      else if (Node.isElementAccessExpression(parent)) read = parent;
      else if (Node.isBindingElement(parent)) kind = "destructure";
      else continue;

      const usage: UsageRec = { key: rec.key, path, line, col, kind, code: lineText(sf, line) };
      const value = read ?? (Node.isBindingElement(parent) ? parent.getNameNode() : undefined);
      const flows = value ? followAliases(value, dir) : [];
      if (flows.length) {
        for (const flow of flows) {
          const at = flow.node;
          const sinkFile = at.getSourceFile();
          const sinkLine = at.getStartLineNumber();
          const sinkCol = at.getStart() - sinkFile.compilerNode.getLineStarts()[sinkLine - 1] + 1;
          usages.push({ ...usage, path: relPath(dir, sinkFile), line: sinkLine, col: sinkCol, code: lineText(sinkFile, sinkLine), passesTo: flow.flow, flowNote: flow.note });
        }
        continue;
      }
      if (read && Node.isBinaryExpression(read.getParent()) && ['+', '-', '*', '/', '%', '**', '<<', '>>', '>>>', '&', '|', '^'].includes((read.getParent() as import('ts-morph').BinaryExpression).getOperatorToken().getText())) usage.flowNote = 'value participates in a transform; verify conversion by hand';
      usages.push(usage);
    }
  }
  const order = (a: { path: string; line: number }, b: { path: string; line: number }) =>
    a.path.localeCompare(b.path) || a.line - b.line;
  return { producers: producers.sort(order), usages: usages.sort(order) };
}

/** Follow at most eight immutable scalar aliases. Never infer arithmetic or mutable writes. */
function followAliases(value: Node, dir: string, depth = 0, seen = new Set<string>()): { node: Expression; flow?: NonNullable<UsageRec['passesTo']>; note?: string }[] {
  if (depth >= 8) return [];
  const id = `${value.getSourceFile().getFilePath()}:${value.getStart()}`;
  if (seen.has(id)) return [];
  const visited = new Set(seen).add(id);
  if (Node.isExpression(value)) {
    const flow = followIntoCall(value, dir);
    if (flow) return [{ node: value, flow }];
  }
  const parent = value.getParent();
  // Shorthand destructuring references can include references to the contract property itself.
  // Those are independent field reads, not uses of this local scalar alias.
  if (depth > 0 && parent && (
    (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === value) ||
    (Node.isPropertyAssignment(parent) && parent.getNameNode() === value) ||
    Node.isImportSpecifier(parent) || Node.isImportClause(parent) || Node.isExportSpecifier(parent)
  )) return [];
  let alias: Node | undefined;
  if (parent && Node.isVariableDeclaration(parent) && parent.getInitializer() === value && parent.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const) alias = parent.getNameNode();
  else if (parent && Node.isBindingElement(parent) && parent.getNameNode() === value && !parent.getInitializer()) {
    const declaration = parent.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (declaration?.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const) alias = value;
  }
  if (!alias || !Node.isIdentifier(alias)) {
    if (parent && Node.isBinaryExpression(parent) && ['+', '-', '*', '/', '%', '**', '<<', '>>', '>>>', '&', '|', '^'].includes(parent.getOperatorToken().getText()) && Node.isExpression(value)) return [{node:value, note:'value participates in a transform; verify conversion by hand'}];
    if (depth > 0 && Node.isExpression(value)) return [{node:value, note:'unresolved value flow; verify by hand'}];
    return [];
  }
  return alias.findReferencesAsNodes().filter(r => isInside(dir, r.getSourceFile())).flatMap(ref => followAliases(ref, dir, depth + 1, visited));
}

/** `fn(order.duration)` → the parameter of fn that receives the value, with its meaning tags. */
function followIntoCall(read: Expression, dir: string): UsageRec["passesTo"] | undefined {
  const call = read.getParent();
  if (!call || !Node.isCallExpression(call)) return undefined;
  const argIndex = (call as CallExpression).getArguments().indexOf(read);
  if (argIndex < 0) return undefined;

  let symbol = call.getExpression().getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol;
  for (let depth = 0; depth < 8; depth++) {
    const candidate = symbol?.getDeclarations()[0];
    if (!candidate || !Node.isVariableDeclaration(candidate) || candidate.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const) break;
    const init = candidate.getInitializer();
    if (!init || !Node.isIdentifier(init)) break;
    symbol = init.getSymbol();
    if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol;
  }
  const decl = symbol?.getDeclarations().find((d) => Node.isFunctionDeclaration(d) || Node.isVariableDeclaration(d) || Node.isMethodDeclaration(d));
  if (!decl) return undefined;
  let fnNode: Node = decl;
  if (Node.isVariableDeclaration(decl)) {
    const init = decl.getInitializer();
    if (!init || !(Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return undefined;
    fnNode = init;
  }
  if (!(Node.isFunctionDeclaration(fnNode) || Node.isArrowFunction(fnNode) || Node.isFunctionExpression(fnNode) || Node.isMethodDeclaration(fnNode))) {
    return undefined;
  }
  const params = fnNode.getParameters();
  const p: ParameterDeclaration | undefined = params[argIndex];
  if (!p) return undefined;
  const sf = fnNode.getSourceFile();
  if (!isInside(dir, sf)) return undefined;

  const name = Node.isFunctionDeclaration(fnNode) || Node.isMethodDeclaration(fnNode)
    ? (fnNode.getName() ?? "anonymous")
    : (decl as Node).getSymbol()?.getName() ?? "anonymous";
  const fn: FunctionRec = { name, path: relPath(dir, sf), line: fnNode.getStartLineNumber() };
  const param: ParamRec = { name: p.getName(), index: argIndex, path: fn.path, line: p.getStartLineNumber(), ...paramTags(p, fnNode) };
  return { fn, param, argIndex };
}

/** Tags from the parameter's own leading comment, or from `@param name @unit x` style JSDoc on the function. */
function paramTags(p: ParameterDeclaration, fnNode: Node): Tags {
  // Leading trivia of the parameter holds `/** @unit seconds */` (ts-morph does not expose it as JSDoc).
  const own = p.getFullText().slice(0, p.getStart() - p.getPos());
  const tags = tagsFromText(own);
  if (Object.keys(tags).length) return tags;
  if (Node.isJSDocable(fnNode)) {
    for (const doc of fnNode.getJsDocs()) {
      for (const tag of doc.getTags()) {
        if (Node.isJSDocParameterTag(tag) && tag.getName() === p.getName()) return tagsFromText(tag.getText());
      }
    }
  }
  return {};
}

/** Name a producer: `order.summary` when the enclosing function is wired into a router, else the function name. */
function producerName(prop: Node): string {
  const fn = prop.getFirstAncestor(
    (a) => Node.isFunctionDeclaration(a) || Node.isArrowFunction(a) || Node.isFunctionExpression(a) || Node.isMethodDeclaration(a),
  );
  let fnName = "(top level)";
  if (fn && (Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn))) fnName = fn.getName() ?? fnName;
  else if (fn) fnName = fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? fnName;

  const sf = prop.getSourceFile();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== "router") continue;
    const routerVar = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? "";
    const obj = call.getArguments()[0];
    if (!obj || !Node.isObjectLiteralExpression(obj)) continue;
    for (const p of obj.getProperties()) {
      if (Node.isPropertyAssignment(p) && p.getInitializer()?.getText().includes(`${fnName}(`)) {
        return `${routerVar.replace(/Router$/, "")}.${p.getName()}`;
      }
    }
  }
  return fnName;
}

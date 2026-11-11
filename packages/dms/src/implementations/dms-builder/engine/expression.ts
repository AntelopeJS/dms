import { isIndexable } from "./guards";
import {
  Node,
  type PropertyAccessExpression,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";

/** Type-only syntax never changes the runtime value. */
export function unwrapExpression(node: Node): Node {
  while (
    Node.isParenthesizedExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    (Node.isAsExpression(node) && node.getTypeNode()?.getText() === "const")
  ) {
    node = node.getExpression();
  }
  return node;
}

const exportsOf = new Map<string, unknown>();

function loadExports(module: string): void {
  if (exportsOf.has(module)) return;
  try {
    exportsOf.set(module, require(module));
  } catch {
    exportsOf.set(module, undefined);
  }
}

/**
 * Whether `name` imported from `module` is the catalog entry's export.
 *
 * The DMS documents per-block subpaths beside its barrel — `KpiCard` from
 * `…/base/kpi-card` is the `KpiCard` of `…/base`. A subpath is accepted when it
 * exports the very same value at run time, not because it is spelled like one:
 * a subpath that binds another value under that name is not the catalog's.
 */
function fromEntryModule(
  module: string,
  name: string,
  entry: { name: string; module?: string },
): boolean {
  if (entry.name !== name || !entry.module) return false;
  if (module === entry.module) return true;
  if (!module.startsWith(`${entry.module}/`)) return false;
  loadExports(module);
  loadExports(entry.module);
  const mine = exportsOf.get(module);
  const theirs = exportsOf.get(entry.module);
  return (
    isIndexable(mine) &&
    isIndexable(theirs) &&
    mine[name] !== undefined &&
    mine[name] === theirs[name]
  );
}

/** Resolve bindings, not their spelling: a local KpiCard is not a DMS import. */
export function importedName(
  node: Node,
  imports: { name: string; module?: string }[],
  seen = new Set<Node>(),
): string | undefined {
  node = unwrapExpression(node);
  if (seen.has(node)) return undefined;
  seen.add(node);
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  for (const declaration of declarations) {
    if (Node.isImportSpecifier(declaration)) {
      const module = declaration
        .getImportDeclaration()
        .getModuleSpecifierValue();
      const name = declaration.getName();
      if (imports.some((entry) => fromEntryModule(module, name, entry)))
        return name;
    }
    if (
      Node.isVariableDeclaration(declaration) &&
      declaration.getVariableStatement()?.getDeclarationKind() ===
        VariableDeclarationKind.Const
    ) {
      const initializer = declaration.getInitializer();
      if (initializer) return importedName(initializer, imports, seen);
    }
  }
  return Node.isPropertyAccessExpression(node)
    ? propertyImport(node, imports, seen)
    : undefined;
}

function propertyImport(
  node: PropertyAccessExpression,
  imports: { name: string; module?: string }[],
  seen: Set<Node>,
): string | undefined {
  for (const entry of imports) {
    const dot = entry.name.lastIndexOf(".");
    if (
      dot !== -1 &&
      entry.name.slice(dot + 1) === node.getName() &&
      importedName(
        node.getExpression(),
        [{ ...entry, name: entry.name.slice(0, dot) }],
        new Set(seen),
      )
    )
      return entry.name;
  }
  const namespace = node.getExpression().getSymbol()?.getDeclarations()[0];
  if (namespace && Node.isNamespaceImport(namespace)) {
    const module = namespace
      .getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
      ?.getModuleSpecifierValue();
    return module === undefined
      ? undefined
      : imports.find((entry) => fromEntryModule(module, node.getName(), entry))
          ?.name;
  }
  return undefined;
}

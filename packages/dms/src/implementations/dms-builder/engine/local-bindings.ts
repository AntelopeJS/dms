import {
  type BindingElement,
  type Identifier,
  Node,
  type SourceFile,
  type Symbol as BindingSymbol,
  SyntaxKind,
  type VariableDeclaration,
} from "ts-morph";

/**
 * A name the file binds at top level and keeps to itself: nothing else can
 * reach it. `scope` is the code a use inside does not count, the declaration
 * itself, and `remove` takes the binding out of the file.
 */
interface LocalBinding {
  name: string;
  binding: Identifier;
  scope: Node;
  remove: () => void;
}

/**
 * Where the file uses the symbol `binding` names. The language service
 * resolves symbols, so a member, a parameter or a qualified name of the same
 * spelling is not a use. Only the file is searched: a project-wide search finds
 * the same uses here, after reading every other file.
 */
export function referenceStarts(
  sourceFile: SourceFile,
  binding: Node,
): number[] {
  const fileName = sourceFile.getFilePath();
  const highlights =
    sourceFile
      .getProject()
      .getLanguageService()
      .compilerObject.getDocumentHighlights(fileName, binding.getStart(), [
        fileName,
      ]) ?? [];
  return highlights.flatMap((highlight) =>
    highlight.highlightSpans.map((span) => span.textSpan.start),
  );
}

/** The elements of a destructuring pattern, holes of an array pattern included. */
function patternElements(pattern: Node): Node[] {
  return Node.isObjectBindingPattern(pattern) ||
    Node.isArrayBindingPattern(pattern)
    ? pattern.getElements()
    : [];
}

/** The elements of a declaration's patterns, at any depth, that bind a name. */
function namedElements(declaration: VariableDeclaration): BindingElement[] {
  return declaration
    .getNameNode()
    .getDescendantsOfKind(SyntaxKind.BindingElement)
    .filter((element) => Node.isIdentifier(element.getNameNode()));
}

/**
 * Whether one name can leave the declaration alone. A literal destructured in
 * place is checked against the pattern, so dropping one of several names from
 * the pattern alone fails on the literal's excess member.
 */
function isPrunableSingly(declaration: VariableDeclaration): boolean {
  const initializer = declaration.getInitializer();
  return (
    namedElements(declaration).length === 1 ||
    !(
      Node.isObjectLiteralExpression(initializer) ||
      Node.isArrayLiteralExpression(initializer)
    )
  );
}

function removeBindingElement(
  declaration: VariableDeclaration,
  element: BindingElement,
): void {
  const pattern = element.getParentOrThrow();
  const kept = patternElements(pattern);
  if (namedElements(declaration).length === 1) {
    declaration.remove();
    return;
  }
  const texts = kept.map((child) => (child === element ? "" : child.getText()));
  if (Node.isObjectBindingPattern(pattern)) {
    pattern.replaceWithText(
      `{ ${texts.filter((text) => text !== "").join(", ")} }`,
    );
  } else {
    pattern.replaceWithText(`[${texts.join(", ")}]`);
  }
}

/**
 * The bindings a destructuring declaration names. A sibling of a rest element
 * is left out: removing it would change what the rest holds.
 */
function patternBindings(declaration: VariableDeclaration): LocalBinding[] {
  return declaration
    .getNameNode()
    .getDescendantsOfKind(SyntaxKind.BindingElement)
    .filter((element) => {
      const hasRest = patternElements(element.getParentOrThrow()).some(
        (child) =>
          Node.isBindingElement(child) &&
          child.getDotDotDotToken() !== undefined,
      );
      return (
        isPrunableSingly(declaration) &&
        (!hasRest || element.getDotDotDotToken() !== undefined)
      );
    })
    .flatMap((element) => {
      const name = element.getNameNode();
      return Node.isIdentifier(name)
        ? [
            {
              name: name.getText(),
              binding: name,
              scope: element,
              remove: () => removeBindingElement(declaration, element),
            },
          ]
        : [];
    });
}

function variableBindings(declaration: VariableDeclaration): LocalBinding[] {
  const name = declaration.getNameNode();
  if (!Node.isIdentifier(name)) {
    return patternBindings(declaration);
  }
  return [
    {
      name: name.getText(),
      binding: name,
      scope: declaration,
      remove: () => declaration.remove(),
    },
  ];
}

/** The file's unexported top-level bindings. */
function localBindings(sourceFile: SourceFile): LocalBinding[] {
  const locals = sourceFile
    .getVariableStatements()
    .filter((statement) => !statement.isExported())
    .flatMap((statement) =>
      statement.getDeclarations().flatMap(variableBindings),
    );
  for (const node of [
    ...sourceFile.getFunctions(),
    ...sourceFile.getClasses(),
    ...sourceFile.getEnums(),
    ...sourceFile.getInterfaces(),
    ...sourceFile.getTypeAliases(),
  ]) {
    const binding = node.getNameNode();
    if (!node.isExported() && binding !== undefined) {
      locals.push({
        name: binding.getText(),
        binding,
        scope: node,
        remove: () => node.remove(),
      });
    }
  }
  return locals;
}

/**
 * Whether anything outside its own declaration uses the local. The key of an
 * object literal member shares the symbol of a binding destructured from it
 * (`const { board } = { board: "Board" }`) but never reads it.
 */
function isLocalReferenced(
  sourceFile: SourceFile,
  local: LocalBinding,
): boolean {
  const start = local.scope.getStart();
  const end = local.scope.getEnd();
  const symbol = local.binding.getSymbol();
  return referenceStarts(sourceFile, local.binding).some(
    (position) =>
      (position < start || position >= end) &&
      readsSymbol(sourceFile.getDescendantAtPos(position), symbol),
  );
}

/**
 * Whether the identifier at a highlight reads the local's own symbol. A
 * highlight of a destructured name also covers the property it came from: a
 * key, a property signature or a `labels.board` access, none of which reads it.
 */
function readsSymbol(
  node: Node | undefined,
  symbol: BindingSymbol | undefined,
): boolean {
  const parent = node?.getParent();
  if (node === undefined || Node.isExportSpecifier(parent)) {
    return true;
  }
  const read = Node.isShorthandPropertyAssignment(parent)
    ? parent.getValueSymbol()
    : node.getSymbol();
  return read === undefined || read === symbol;
}

/**
 * The file's own top-level bindings something in it still uses, before a
 * removal. Pass the result back to {@link pruneUnusedLocals}.
 */
export function referencedLocalNames(sourceFile: SourceFile): Set<string> {
  return new Set(
    localBindings(sourceFile)
      .filter((local) => isLocalReferenced(sourceFile, local))
      .map((local) => local.name),
  );
}

/**
 * Drops the bindings a removal left without a user: the constant only a
 * deleted page read, then whatever only that constant read. One that was unused
 * to begin with is the author's, and stays.
 */
export function pruneUnusedLocals(
  sourceFile: SourceFile,
  used: Set<string>,
): void {
  const pending = new Set(used);
  let orphan = findOrphanedLocal(sourceFile, pending);
  while (orphan) {
    pending.delete(orphan.name);
    orphan.remove();
    orphan = findOrphanedLocal(sourceFile, pending);
  }
}

function findOrphanedLocal(
  sourceFile: SourceFile,
  pending: Set<string>,
): LocalBinding | undefined {
  return localBindings(sourceFile).find(
    (local) => pending.has(local.name) && !isLocalReferenced(sourceFile, local),
  );
}

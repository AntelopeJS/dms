import fs from "node:fs";
import path from "node:path";
import type {
  FileChange,
  TypecheckError,
} from "@antelopejs/interface-dms-builder";
import { type StructuredPatchHunk, structuredPatch } from "diff";
import {
  type ClassDeclaration,
  type Diagnostic,
  DiagnosticMessageChain,
  type ExportDeclaration,
  type FunctionDeclaration,
  type ImportDeclaration,
  type ImportSpecifier,
  type InterfaceDeclaration,
  Node,
  type Project,
  type SourceFile,
  SyntaxKind,
  type TypeAliasDeclaration,
  type VariableDeclaration,
} from "ts-morph";
import { getCalleeName, getExtendsCall, stringLiteralValue } from "./literals";
import {
  addModuleSources,
  createModulesProject,
  targetModule,
} from "./modules";

let writable: Project | undefined;

export function getWritableProject(): Project {
  if (!writable) {
    writable = createModulesProject();
  }
  return writable;
}

/**
 * Drop the cached project so the next call builds one from the configured root
 * again. The project is resolved once per process because an app's root does not
 * move under a running server; a test suite pointing the engine at a fresh
 * fixture is the case that does move it.
 */
export function resetWritableProject(): void {
  writable = undefined;
}

/**
 * Bring the project's source files in line with the disk, adding the ones
 * created since and dropping the ones that are gone. Changed files are
 * reapplied as a text change: ts-morph's own refresh prints them through a
 * writer that normalizes CRLF before the editor can preserve source
 * expressions.
 */
export function refreshFromDisk(project: Project): void {
  addModuleSources(project);
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.isInNodeModules()) {
      const filepath = sourceFile.getFilePath();
      if (!fs.existsSync(filepath)) {
        project.removeSourceFile(sourceFile);
        continue;
      }
      const text = fs.readFileSync(filepath, "utf8");
      if (text !== sourceFile.getFullText()) {
        sourceFile.applyTextChanges([
          { span: { start: 0, length: sourceFile.getEnd() }, newText: text },
        ]);
      }
    }
  }
}

/** The root barrel of a module: the project's own unless another is named. */
export function resolveRootBarrel(
  project: Project,
  module?: string,
): SourceFile | undefined {
  const root = targetModule(module)?.root;
  if (!root) {
    return undefined;
  }
  const candidates = [
    path.join(root, "src/index.ts"),
    path.join(root, "index.ts"),
  ];
  for (const candidate of candidates) {
    const file = project.getSourceFile(candidate);
    if (file) {
      return file;
    }
  }
  return undefined;
}

export function findImporters(
  project: Project,
  targetPath: string,
): Array<ImportDeclaration | ExportDeclaration> {
  const importers: Array<ImportDeclaration | ExportDeclaration> = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isInNodeModules()) {
      continue;
    }
    const declarations = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ];
    for (const decl of declarations) {
      if (decl.getModuleSpecifierSourceFile()?.getFilePath() === targetPath) {
        importers.push(decl);
      }
    }
  }
  return importers;
}

/** Whether a declaration binds any name at all, rather than only loading a module. */
export function bindsNothing(declaration: ImportDeclaration): boolean {
  return (
    declaration.getNamedImports().length === 0 &&
    !declaration.getDefaultImport() &&
    !declaration.getNamespaceImport()
  );
}

/**
 * The names the file binds through its named imports, before a rewrite. Pass
 * the result back to {@link pruneUnusedImports} so it drops only what the
 * rewrite orphaned.
 */
export function referencedImportNames(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      if (isReferenced(sourceFile, specifier)) {
        names.add(specifier.getAliasNode()?.getText() ?? specifier.getName());
      }
    }
  }
  return names;
}

/**
 * Whether the file uses the binding the specifier imports. Only the file is
 * searched: a project-wide search finds the same uses here, after reading
 * every other file.
 */
function isReferenced(
  sourceFile: SourceFile,
  specifier: ImportSpecifier,
): boolean {
  const binding = specifier.getAliasNode() ?? specifier.getNameNode();
  const fileName = sourceFile.getFilePath();
  const highlights =
    sourceFile
      .getProject()
      .getLanguageService()
      .compilerObject.getDocumentHighlights(fileName, binding.getStart(), [
        fileName,
      ]) ?? [];
  return highlights.some((highlight) =>
    highlight.highlightSpans.some(
      (span) =>
        sourceFile
          .getDescendantAtPos(span.textSpan.start)
          ?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) === undefined,
    ),
  );
}

/**
 * Drops named imports the rewrite just orphaned. A whole-tree rewrite can
 * remove the last user of a factory, and a dangling import would otherwise stay
 * behind in the file the builder wrote.
 *
 * `used` names what the file referenced beforehand, and nothing outside it is
 * touched: an import that was already unused belongs to the author, and
 * deleting it would put a change they never asked for in the diff of a save. A
 * declaration that binds nothing is a deliberate side-effect import and is left
 * alone whether or not it started out empty.
 */
export function pruneUnusedImports(
  sourceFile: SourceFile,
  used: Set<string>,
): void {
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (bindsNothing(declaration)) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      const name = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (used.has(name) && !isReferenced(sourceFile, specifier)) {
        specifier.remove();
      }
    }
    if (bindsNothing(declaration)) {
      declaration.remove();
    }
  }
}

/** A top-level declaration the file keeps to itself: nothing else can reach it. */
interface LocalDeclaration {
  name: string;
  node:
    | VariableDeclaration
    | FunctionDeclaration
    | InterfaceDeclaration
    | TypeAliasDeclaration;
}

/**
 * The file's unexported top-level declarations. A destructuring pattern is
 * skipped: it names several bindings at once, and removing one of them is not
 * a removal of the declaration.
 */
function localDeclarations(sourceFile: SourceFile): LocalDeclaration[] {
  const locals: LocalDeclaration[] = [];
  for (const statement of sourceFile.getVariableStatements()) {
    if (statement.isExported()) {
      continue;
    }
    for (const node of statement.getDeclarations()) {
      if (Node.isIdentifier(node.getNameNode())) {
        locals.push({ name: node.getName(), node });
      }
    }
  }
  for (const node of [
    ...sourceFile.getFunctions(),
    ...sourceFile.getInterfaces(),
    ...sourceFile.getTypeAliases(),
  ]) {
    const name = node.getName();
    if (!node.isExported() && name !== undefined) {
      locals.push({ name, node });
    }
  }
  return locals;
}

/**
 * Whether anything else in the file uses the local. Read off the identifiers
 * rather than the language service: a name that only looks used (a property of
 * the same spelling) keeps a declaration that could have gone, which is the
 * safe way to be wrong.
 */
function isLocalReferenced(
  sourceFile: SourceFile,
  local: LocalDeclaration,
): boolean {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        identifier.getText() === local.name &&
        !local.node.containsRange(identifier.getPos(), identifier.getEnd()),
    );
}

/**
 * The file's own top-level declarations something in it still uses, before a
 * removal. Pass the result back to {@link pruneUnusedLocals}.
 */
export function referencedLocalNames(sourceFile: SourceFile): Set<string> {
  return new Set(
    localDeclarations(sourceFile)
      .filter((local) => isLocalReferenced(sourceFile, local))
      .map((local) => local.name),
  );
}

/**
 * Drops the declarations a removal left without a user: the constant only a
 * deleted page read, then whatever only that constant read. As with imports,
 * one that was unused to begin with is the author's, and stays.
 */
export function pruneUnusedLocals(
  sourceFile: SourceFile,
  used: Set<string>,
): void {
  const pending = new Set(used);
  let orphan = findOrphanedLocal(sourceFile, pending);
  while (orphan) {
    pending.delete(orphan.name);
    orphan.node.remove();
    orphan = findOrphanedLocal(sourceFile, pending);
  }
}

function findOrphanedLocal(
  sourceFile: SourceFile,
  pending: Set<string>,
): LocalDeclaration | undefined {
  return localDeclarations(sourceFile).find(
    (local) => pending.has(local.name) && !isLocalReferenced(sourceFile, local),
  );
}

/**
 * Whether nothing but imports is left in the file. Once its last declaration
 * is gone a file is debris, to be deleted and unwired from its barrel rather
 * than left as an empty module something still loads.
 */
export function holdsOnlyImports(sourceFile: SourceFile): boolean {
  return sourceFile
    .getStatements()
    .every((statement) => Node.isImportDeclaration(statement));
}

export function findPageClass(
  sourceFile: SourceFile,
  id: string,
): ClassDeclaration | undefined {
  for (const cls of sourceFile.getClasses()) {
    const call = getExtendsCall(cls);
    if (!call || getCalleeName(call) !== "PageController") {
      continue;
    }
    if (stringLiteralValue(call.getArguments()[0]) === id) {
      return cls;
    }
  }
  return undefined;
}

function diagnosticToError(diagnostic: Diagnostic): TypecheckError {
  const message = diagnostic.getMessageText();
  return {
    file: diagnostic.getSourceFile()?.getFilePath() ?? "",
    line: diagnostic.getLineNumber() ?? 0,
    message:
      message instanceof DiagnosticMessageChain
        ? message.getMessageText()
        : message,
  };
}

/**
 * The diagnostics of the program's own files, imported ones included. Each
 * file is checked on its own: the whole program's diagnostics would also check
 * every declaration file in `node_modules`, whose errors are never reported.
 */
function relevantDiagnostics(project: Project): TypecheckError[] {
  return project
    .getProgram()
    .compilerObject.getSourceFiles()
    .flatMap((file) => {
      const sourceFile = project.getSourceFile(file.fileName);
      return sourceFile && !sourceFile.isInNodeModules()
        ? sourceFile.getPreEmitDiagnostics()
        : [];
    })
    .filter((diagnostic) => {
      const file = diagnostic.getSourceFile();
      return file !== undefined && !file.isInNodeModules();
    })
    .map(diagnosticToError);
}

const DIFF_CONTEXT_LINES = 3;

/** A hunk side's start as unified diffs write it: the line before, for a side with no lines. */
function sideStart(start: number, lines: number): number {
  return lines === 0 ? start - 1 : start;
}

function hunkText(hunk: StructuredPatchHunk): string {
  const header = `@@ -${sideStart(hunk.oldStart, hunk.oldLines)},${hunk.oldLines} +${sideStart(hunk.newStart, hunk.newLines)},${hunk.newLines} @@`;
  return [header, ...hunk.lines].join("\n");
}

/**
 * The change from `before` to `after` as unified diff hunks, with a few unchanged lines around
 * each; empty when nothing changed.
 */
export function diffText(before: string, after: string): string {
  if (before === after) {
    return "";
  }
  const patch = structuredPatch("", "", before, after, "", "", {
    context: DIFF_CONTEXT_LINES,
  });
  return patch.hunks.map(hunkText).join("\n");
}

type ChangeKind = "create" | "modify" | "delete";

interface TouchedFile {
  path: string;
  before?: string;
  kind: ChangeKind;
}

/**
 * Drop the directory a deleted file leaves behind, when nothing else is in it.
 *
 * A page lives in a directory of its own, so removing the file alone leaves an
 * empty folder in the author's tree for every page deleted or moved. Anything
 * still inside — a sibling file, another page — keeps it. A directory that is
 * already gone, or not ours to remove, is left alone: leaving it costs nothing.
 */
function removeEmptyDirectory(dir: string): void {
  try {
    if (fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
    }
  } catch {}
}

let typechecks = 0;

/** How many project typechecks have run in this process; a test reads the difference across an operation. */
export function typecheckCount(): number {
  return typechecks;
}

export class Transaction {
  private readonly touched = new Map<string, TouchedFile>();

  constructor(private readonly project: Project) {}

  public track(sourceFile: SourceFile, isNew = false): void {
    const filePath = sourceFile.getFilePath();
    if (!this.touched.has(filePath)) {
      this.touched.set(filePath, {
        path: filePath,
        before: isNew ? undefined : sourceFile.getFullText(),
        kind: isNew ? "create" : "modify",
      });
    }
  }

  public trackDelete(sourceFile: SourceFile): void {
    const filePath = sourceFile.getFilePath();
    const tracked = this.touched.get(filePath);
    this.touched.set(filePath, {
      path: filePath,
      before: tracked ? tracked.before : sourceFile.getFullText(),
      kind: "delete",
    });
    this.project.removeSourceFile(sourceFile);
  }

  public typecheckErrors(): TypecheckError[] {
    typechecks += 1;
    return relevantDiagnostics(this.project);
  }

  /**
   * The first file the transaction read whose text on disk is no longer what
   * it read, with the text it holds now: a save from outside the builder that
   * landed while the operation ran, which a flush would overwrite. A file gone
   * from disk holds no text.
   */
  public changedOnDisk(): { path: string; text: string } | undefined {
    for (const entry of this.touched.values()) {
      if (entry.before === undefined) {
        continue;
      }
      const text = fs.existsSync(entry.path)
        ? fs.readFileSync(entry.path, "utf8")
        : "";
      if (text !== entry.before) {
        return { path: entry.path, text };
      }
    }
    return undefined;
  }

  public rollback(): void {
    for (const entry of this.touched.values()) {
      if (entry.kind === "delete") {
        this.project.addSourceFileAtPathIfExists(entry.path);
        continue;
      }
      const sourceFile = this.project.getSourceFile(entry.path);
      if (!sourceFile) {
        continue;
      }
      if (entry.kind === "create") {
        this.project.removeSourceFile(sourceFile);
      } else if (entry.before !== undefined) {
        sourceFile.applyTextChanges([
          {
            span: { start: 0, length: sourceFile.getEnd() },
            newText: entry.before,
          },
        ]);
      }
    }
  }

  public flush(): FileChange[] {
    const changes: FileChange[] = [];
    for (const entry of this.touched.values()) {
      if (entry.kind === "delete") {
        fs.rmSync(entry.path, { force: true });
        removeEmptyDirectory(path.dirname(entry.path));
        changes.push({ path: entry.path, kind: "delete", diff: "" });
        continue;
      }
      const sourceFile = this.project.getSourceFile(entry.path);
      if (!sourceFile) {
        continue;
      }
      const after = sourceFile.getFullText();
      sourceFile.saveSync();
      changes.push({
        path: entry.path,
        kind: entry.kind,
        diff: diffText(entry.before ?? "", after),
      });
    }
    return changes;
  }
}

import type { TypecheckError } from "@antelopejs/interface-dms-builder";
import {
  type Diagnostic,
  DiagnosticMessageChain,
  type Project,
  ts,
} from "ts-morph";

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

/** What the last typecheck of a project that found no error read. */
interface CleanCheck {
  /** The parsed files it read. A file the program holds and this does not has changed since. */
  files: WeakSet<ts.SourceFile>;
  /** The files that import each file, by path. */
  importers: Map<string, string[]>;
  /** The files whose declarations reach past their own module. */
  global: Set<string>;
}

const cleanChecks = new WeakMap<Project, CleanCheck>();

/**
 * Whether a file declares into a scope other files share: a script, or a module
 * with a `declare global` block, a `declare module "…"` block or an
 * `export as namespace`.
 */
function reachesPastModule(file: ts.SourceFile): boolean {
  return (
    !ts.isExternalModule(file) ||
    file.statements.some(
      (statement) =>
        ts.isNamespaceExportDeclaration(statement) ||
        (ts.isModuleDeclaration(statement) &&
          (ts.isStringLiteral(statement.name) ||
            (statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0)),
    )
  );
}

/** The extensions TypeScript tries, in order, on a `/// <reference path>` written without one. */
const REFERENCE_EXTENSIONS = [".ts", ".tsx", ".d.ts", ".js", ".jsx"];

/**
 * The program's file a `/// <reference path>` names: the path as written when
 * the program holds it, else with the first extension that names one. A file
 * the program does not hold keeps the path as written.
 */
function referencedFile(
  reference: string,
  importer: string,
  present: Set<string>,
): string {
  const named = ts.resolveTripleslashReference(reference, importer);
  return (
    [named, ...REFERENCE_EXTENSIONS.map((extension) => named + extension)].find(
      (candidate) => present.has(candidate),
    ) ?? named
  );
}

/**
 * The files a file imports, by path, through a module specifier, a
 * `declare module "…"` block that augments another module, or a
 * `/// <reference path>`.
 */
function importsOf(
  project: Project,
  file: ts.SourceFile,
  present: Set<string>,
): readonly string[] {
  const checker = project.getTypeChecker().compilerObject;
  const literals =
    project
      .getSourceFile(file.fileName)
      ?.getImportStringLiterals()
      .map((literal) => literal.compilerNode) ?? [];
  const augmented = file.statements
    .filter(ts.isModuleDeclaration)
    .map((declaration) => declaration.name)
    .filter(ts.isStringLiteral);
  return [
    ...[...literals, ...augmented]
      .flatMap((name) => checker.getSymbolAtLocation(name)?.declarations ?? [])
      .map((declaration) => declaration.getSourceFile().fileName)
      .filter((imported) => imported !== file.fileName),
    ...file.referencedFiles.map((reference) =>
      referencedFile(reference.fileName, file.fileName, present),
    ),
  ];
}

/** The files that import each file of the program, by path. */
function importGraph(
  project: Project,
  files: readonly ts.SourceFile[],
): Map<string, string[]> {
  const present = new Set(files.map((file) => file.fileName));
  const importers = new Map<string, string[]>();
  for (const file of files) {
    const importer = file.fileName;
    for (const name of importsOf(project, file, present)) {
      const known = importers.get(name);
      if (known) {
        known.push(importer);
      } else {
        importers.set(name, [importer]);
      }
    }
  }
  return importers;
}

/**
 * The files whose diagnostics may differ from the clean check's: each file
 * parsed again or gone since, and every file importing one of them, at any
 * depth. Every file when one of them declares past its module.
 */
function affectedFiles(
  files: readonly ts.SourceFile[],
  importers: Map<string, string[]>,
  global: Set<string>,
  clean: CleanCheck,
): readonly ts.SourceFile[] {
  const present = new Set(files.map((file) => file.fileName));
  const affected = new Set([
    ...files
      .filter((file) => !clean.files.has(file))
      .map((file) => file.fileName),
    ...[...clean.importers.keys(), ...clean.global].filter(
      (name) => !present.has(name),
    ),
  ]);
  for (const name of affected) {
    for (const importer of [
      ...(importers.get(name) ?? []),
      ...(clean.importers.get(name) ?? []),
    ]) {
      affected.add(importer);
    }
  }
  return [...affected].some(
    (name) => global.has(name) || clean.global.has(name),
  )
    ? files
    : files.filter((file) => affected.has(file.fileName));
}

/**
 * The diagnostics of the program's own files, imported ones included. Once a
 * check of the project found no error, the next checks only the files that
 * could have one now. Each file is checked on its own: the whole program's
 * diagnostics would also check every declaration file in `node_modules`, whose
 * errors are never reported.
 */
export function relevantDiagnostics(project: Project): TypecheckError[] {
  const files = project.getProgram().compilerObject.getSourceFiles();
  const importers = importGraph(project, files);
  const global = new Set(
    files.filter(reachesPastModule).map((file) => file.fileName),
  );
  const clean = cleanChecks.get(project);
  const diagnostics = (
    clean ? affectedFiles(files, importers, global, clean) : files
  )
    .flatMap((file) => {
      const sourceFile = project.getSourceFile(file.fileName);
      return sourceFile && !sourceFile.isInNodeModules()
        ? sourceFile.getPreEmitDiagnostics()
        : [];
    })
    .filter((diagnostic) => {
      const file = diagnostic.getSourceFile();
      return file !== undefined && !file.isInNodeModules();
    });
  if (diagnostics.length === 0) {
    cleanChecks.set(project, { files: new WeakSet(files), importers, global });
  }
  return diagnostics.map(diagnosticToError);
}

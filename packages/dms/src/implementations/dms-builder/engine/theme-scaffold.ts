import fs from "node:fs";
import path from "node:path";
import type {
  OpResult,
  ThemeFiles,
  ThemeLayer,
} from "@antelopejs/interface-dms-builder";
import {
  type FunctionDeclaration,
  Node,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { attachRollbackErrors, FileBatch } from "./file-batch";
import { commit, unsupported } from "./ops";
import { resolveProjectRoot } from "./project";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";
import { scaffoldEntrySource } from "./theme-entry";
import {
  emptyLayersDetail,
  proposedLayerPath,
  resolveThemeLayer,
  resolveThemeRoot,
  themeFiles,
} from "./theme-layer";
import {
  getWritableProject,
  refreshFromDisk,
  resolveRootBarrel,
  Transaction,
} from "./writable";

/**
 * Above the DMS's own frontend, which registers at 0, so the project's values
 * win over the DMS defaults wherever both set one.
 */
/**
 * The `@antelopejs/dms-frontend` releases the frontend modules of a theme layer run on, written into
 * the `package.json` of a layer the builder creates.
 */
const FRONTEND_LOADER_RANGE = ">=0.10.0 <0.11.0";

const LAYER_PRIORITY = 1;

const START_FUNCTION_NAME = "start";
const PATH_MODULE = "node:path";
const BARE_PATH_MODULE = "path";
const PATH_BINDING = "path";
const PAGE_INTERFACE = "@antelopejs/interface-dms/page";
const REGISTER_FUNCTION_NAME = "AddFrontendModule";
const LOADER_PACKAGE = "@antelopejs/dms-frontend";
const LAYER_NAME_SUFFIX = "-frontend";
const FALLBACK_PROJECT_NAME = "project";
const INVALID_PACKAGE_NAME_CHARACTERS = /[^a-z0-9-]+/g;

interface PackageManifest {
  name?: string;
  main?: string;
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return (
    isPlainObject(value) &&
    (value.name === undefined || isString(value.name)) &&
    (value.main === undefined || isString(value.main))
  );
}

function readManifest(directory: string): PackageManifest | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      fs.readFileSync(path.join(directory, "package.json"), "utf8"),
    );
  } catch {
    return undefined;
  }
  return isPackageManifest(parsed) ? parsed : undefined;
}

/** The project's package name with a suffix: `shop` gives `shop-frontend`. */
function deriveLayerName(root: string): string {
  const projectName = (readManifest(root)?.name ?? FALLBACK_PROJECT_NAME)
    .split("/")
    .pop()
    ?.toLowerCase()
    .replace(INVALID_PACKAGE_NAME_CHARACTERS, "-");
  return `${projectName || FALLBACK_PROJECT_NAME}${LAYER_NAME_SUFFIX}`;
}

/**
 * The layer's `package.json` text. Its `engines` entry names the loader
 * releases it runs on, as the loader asks of every module: the theme needs
 * one that applies a layer's app config itself.
 */
function layerManifest(layerName: string, entryPath: string): string {
  const manifest = {
    name: layerName,
    version: "0.0.0",
    private: true,
    type: "module",
    main: `./${entryPath}`,
    engines: { [LOADER_PACKAGE]: FRONTEND_LOADER_RANGE },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Where the project's entry runs from once built: the directory of its
 * package's `main`, which `__dirname` names at run time. A project without
 * one runs its sources in place.
 */
function runtimeDirectory(root: string, barrel: SourceFile): string {
  const main = readManifest(root)?.main;
  return main
    ? path.dirname(path.resolve(root, main))
    : path.dirname(barrel.getFilePath());
}

/**
 * Returns the name `node:path` is imported as, adding
 * `import path from "node:path"` when the barrel has no such import.
 * Undefined when that import has no default or namespace name, or when `path`
 * already names something else.
 */
function ensurePathImport(barrel: SourceFile): string | undefined {
  const declaration = barrel.getImportDeclaration(
    (candidate) =>
      candidate.getModuleSpecifierValue() === PATH_MODULE ||
      candidate.getModuleSpecifierValue() === BARE_PATH_MODULE,
  );
  if (declaration) {
    return (
      declaration.getDefaultImport()?.getText() ??
      declaration.getNamespaceImport()?.getText()
    );
  }
  if (barrel.getLocal(PATH_BINDING)) {
    return undefined;
  }
  barrel.insertImportDeclaration(0, {
    moduleSpecifier: PATH_MODULE,
    defaultImport: PATH_BINDING,
  });
  return PATH_BINDING;
}

function ensureRegisterFunctionImport(barrel: SourceFile): void {
  const declaration = barrel.getImportDeclaration(
    (candidate) => candidate.getModuleSpecifierValue() === PAGE_INTERFACE,
  );
  const namedImports = declaration?.getNamedImports() ?? [];
  if (
    namedImports.some(
      (specifier) => specifier.getName() === REGISTER_FUNCTION_NAME,
    )
  ) {
    return;
  }
  if (declaration && !declaration.isTypeOnly()) {
    declaration.addNamedImport(REGISTER_FUNCTION_NAME);
    return;
  }
  barrel.addImportDeclaration({
    moduleSpecifier: PAGE_INTERFACE,
    namedImports: [REGISTER_FUNCTION_NAME],
  });
}

/**
 * Makes the exported `start()` async so it can await the registration (a
 * `void` return type becomes `Promise<void>`), or adds one at the end of the
 * file. Undefined when `start` names something else, or a function that is
 * not exported or has no body.
 */
function ensureAsyncStartFunction(
  barrel: SourceFile,
): FunctionDeclaration | undefined {
  const existing = barrel.getFunction(START_FUNCTION_NAME);
  if (!existing) {
    if (barrel.getLocal(START_FUNCTION_NAME)) {
      return undefined;
    }
    return barrel.addFunction({
      name: START_FUNCTION_NAME,
      isExported: true,
      isAsync: true,
      returnType: "Promise<void>",
    });
  }
  if (!existing.isExported() || !existing.getBody()) {
    return undefined;
  }
  if (!existing.isAsync()) {
    existing.setIsAsync(true);
    const returnType = existing.getReturnTypeNode();
    if (returnType?.getKind() === SyntaxKind.VoidKeyword) {
      existing.setReturnType("Promise<void>");
    }
  }
  return existing;
}

function isLayerRegistered(
  start: FunctionDeclaration,
  layerRelativePath: string,
): boolean {
  return start
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some(
      (call) =>
        call.getExpression().getText() === REGISTER_FUNCTION_NAME &&
        call
          .getArguments()
          .some(
            (argument) =>
              Node.isObjectLiteralExpression(argument) &&
              argument.getText().includes(JSON.stringify(layerRelativePath)),
          ),
    );
}

/**
 * Register the layer from the project's `start()`, which runs once the DMS is
 * connected, as the builder registers its own frontend. Returns false when
 * the entry has no exported `start()` with a body, or when `node:path` cannot
 * be bound (imported without a default or namespace name, or `path` already
 * names something else).
 */
function registerLayer(
  barrel: SourceFile,
  root: string,
  layerDirectory: string,
  layerName: string,
): boolean {
  const layerRelativePath = path
    .relative(runtimeDirectory(root, barrel), layerDirectory)
    .split(path.sep)
    .join("/");
  const start = ensureAsyncStartFunction(barrel);
  const pathIdentifier = start ? ensurePathImport(barrel) : undefined;
  if (!start || !pathIdentifier) {
    return false;
  }
  if (isLayerRegistered(start, layerRelativePath)) {
    return true;
  }
  ensureRegisterFunctionImport(barrel);
  start.addStatements((writer) => {
    writer.write(`await ${REGISTER_FUNCTION_NAME}(`).inlineBlock(() => {
      writer.writeLine(`name: ${JSON.stringify(layerName)},`);
      writer.writeLine(
        `sourcePath: ${pathIdentifier}.join(__dirname, ${JSON.stringify(layerRelativePath)}),`,
      );
      writer.writeLine(`renderer: { name: "vue", version: "3" },`);
      writer.writeLine(`priority: ${LAYER_PRIORITY},`);
    });
    writer.write(");");
  });
  return true;
}

/**
 * Skips any file that already exists. The stylesheet starts empty, so the
 * entry's import of it resolves before the first theme is saved.
 */
function stageLayerFiles(
  layerDirectory: string,
  files: ThemeFiles,
  layerName: string,
): FileBatch {
  const batch = new FileBatch();
  const starterFiles: Array<[string, string]> = [
    ["package.json", layerManifest(layerName, files.entryPath)],
    [files.entryPath, scaffoldEntrySource(files.stylesheetPath)],
    [files.stylesheetPath, ""],
  ];
  for (const [relativePath, content] of starterFiles) {
    const filePath = path.join(layerDirectory, relativePath);
    if (!fs.existsSync(filePath)) {
      batch.stageWrite(filePath, content);
    }
  }
  return batch;
}

/**
 * Writes the layer's files, then commits the registration staged in
 * `transaction`. If the registration fails, the layer's files are rolled
 * back, so the project is never left with a layer directory nothing
 * registers.
 */
function writeLayer(
  transaction: Transaction,
  layer: ThemeLayer,
  files: ThemeFiles,
): OpResult<ThemeLayer> {
  const layerFileBatch = stageLayerFiles(layer.sourcePath, files, layer.name);
  const layerChanges = layerFileBatch.flush();
  let registration: OpResult<ThemeLayer>;
  try {
    registration = commit(transaction, layer);
  } catch (error) {
    const rollbackErrors = layerFileBatch.rollback();
    if (error instanceof Error) {
      attachRollbackErrors(error, rollbackErrors);
    }
    throw error;
  }
  if (!registration.ok) {
    layerFileBatch.rollback();
    return registration;
  }
  return {
    ...registration,
    changes: [...layerChanges, ...registration.changes],
  };
}

/**
 * Creates the project's frontend layer (`frontend-vue/` at the project root,
 * with a `package.json`, an entry and an empty stylesheet) and registers it
 * from `start()`, above the DMS. Files already in the directory are kept, and
 * a `start()` that already registers it is left as it is.
 */
export function scaffoldThemeLayer(): OpResult<ThemeLayer> {
  const root = resolveProjectRoot();
  const layerDirectory = proposedLayerPath();
  const themeRelativeDirectory = resolveThemeRoot(layerDirectory);
  if (themeRelativeDirectory === undefined) {
    return unsupported(emptyLayersDetail(layerDirectory));
  }
  const layerName = deriveLayerName(root);
  const project = getWritableProject();
  refreshFromDisk(project);
  const barrel = resolveRootBarrel(project);
  if (!barrel) {
    return unsupported(
      "the project has no src/index.ts to register a frontend layer from",
    );
  }
  const transaction = new Transaction(project);
  transaction.track(barrel);
  if (!registerLayer(barrel, root, layerDirectory, layerName)) {
    transaction.rollback();
    return unsupported(
      `${path.relative(root, barrel.getFilePath())} has no exported start() function the builder can register the layer from`,
    );
  }
  const errors = transaction.typecheckErrors();
  if (errors.length > 0) {
    transaction.rollback();
    return {
      ok: false,
      error: { code: "typecheck_failed", diagnostics: errors },
    };
  }
  return writeLayer(
    transaction,
    { name: layerName, sourcePath: layerDirectory },
    themeFiles(themeRelativeDirectory),
  );
}

/** A project that already has a layer keeps it, and nothing is written. */
export async function createThemeLayer(): Promise<OpResult<ThemeLayer>> {
  const existing = await resolveThemeLayer();
  return existing
    ? { ok: true, data: existing, changes: [] }
    : scaffoldThemeLayer();
}

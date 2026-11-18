import fs from "node:fs";
import path from "node:path";
import type {
  ThemeLayer,
  ThemeLayerDeclaration,
} from "@antelopejs/interface-dms-builder";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";

/** The `package.json` field `@antelopejs/dms-frontend` reads a module's frontend registration from. */
const DECLARATION_FIELD = "dmsFrontend";
const MANIFEST_FILE = "package.json";
const DEFAULT_INDENTATION = "  ";
const INDENTED_KEY = /^([ \t]+)"/m;
const TYPESCRIPT_EXTENSION = /\.ts$/;

export interface PackageManifest {
  name?: string;
  main?: string;
  [DECLARATION_FIELD]?: string;
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return (
    isPlainObject(value) &&
    (value.name === undefined || isString(value.name)) &&
    (value.main === undefined || isString(value.main)) &&
    (value[DECLARATION_FIELD] === undefined ||
      isString(value[DECLARATION_FIELD]))
  );
}

export function manifestPath(directory: string): string {
  return path.join(directory, MANIFEST_FILE);
}

export function readManifest(directory: string): PackageManifest | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath(directory), "utf8"));
  } catch {
    return undefined;
  }
  return isPackageManifest(parsed) ? parsed : undefined;
}

/**
 * Whether the package that ships the layer, the one above its source
 * directory as the frontend loader reads it, names a frontend module.
 */
export function layerDeclaration(layer: ThemeLayer): ThemeLayerDeclaration {
  const owner = path.dirname(layer.sourcePath);
  const declared = readManifest(owner)?.[DECLARATION_FIELD];
  return {
    declared: isString(declared) && declared !== "",
    manifest: manifestPath(owner),
  };
}

/**
 * Where the declared file is once the project is built: `main` names the
 * compiled entry, and the frontend module compiles beside it.
 *
 * @param main The project's `main`, such as `dist/index.js`
 * @param sourceFromEntry The frontend module's TypeScript source, relative to the entry's source directory
 */
export function compiledModulePath(
  main: string,
  sourceFromEntry: string,
): string {
  const compiledDirectory = path.posix.dirname(main.split(path.sep).join("/"));
  const compiled = sourceFromEntry
    .split(path.sep)
    .join("/")
    .replace(TYPESCRIPT_EXTENSION, ".js");
  return path.posix.join(compiledDirectory, compiled);
}

/**
 * The directory's `package.json` with the declaration added, its other
 * fields, their order and its indentation kept. Undefined when it cannot be
 * read.
 */
export function manifestWithDeclaration(
  directory: string,
  compiledPath: string,
): string | undefined {
  let text: string;
  let parsed: unknown;
  try {
    text = fs.readFileSync(manifestPath(directory), "utf8");
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isPackageManifest(parsed)) {
    return undefined;
  }
  const indentation = INDENTED_KEY.exec(text)?.[1] ?? DEFAULT_INDENTATION;
  return `${JSON.stringify({ ...parsed, [DECLARATION_FIELD]: compiledPath }, null, indentation)}\n`;
}

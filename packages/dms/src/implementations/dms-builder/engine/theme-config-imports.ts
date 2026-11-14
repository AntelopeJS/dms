import fs from "node:fs";
import path from "node:path";
import { Project, type SourceFile } from "ts-morph";
import { stringLiterals } from "./theme-app-config";

const RESOLVED_SUFFIXES = [
  "",
  ".ts",
  ".mts",
  ".js",
  ".mjs",
  "/index.ts",
  "/index.js",
];

/**
 * Where a module specifier points on disk: a relative path, or a Nuxt alias of
 * the app directory (`~/`, `@/`) or of the layer root (`~~/`, `@@/`). A
 * package import is not the layer's to scan.
 */
function aliasedPath(
  specifier: string,
  importer: string,
  appDirectory: string,
): string | undefined {
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(importer), specifier);
  }
  const rootAlias = /^(?:~~|@@)\//.exec(specifier);
  if (rootAlias) {
    return path.join(path.dirname(appDirectory), specifier.slice(3));
  }
  const appAlias = /^[~@]\//.exec(specifier);
  return appAlias ? path.join(appDirectory, specifier.slice(2)) : undefined;
}

/** A file the scan cannot read holds no literal it can see. */
function readable(file: string): string | undefined {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function resolvedFile(base: string): string | undefined {
  return RESOLVED_SUFFIXES.map((suffix) => `${base}${suffix}`).find(
    (candidate) => readable(candidate) !== undefined,
  );
}

function localImports(sourceFile: SourceFile, appDirectory: string): string[] {
  return [
    ...sourceFile.getImportDeclarations(),
    ...sourceFile.getExportDeclarations(),
  ]
    .map((declaration) => declaration.getModuleSpecifierValue())
    .filter((specifier) => specifier !== undefined)
    .map((specifier) =>
      aliasedPath(specifier, sourceFile.getFilePath(), appDirectory),
    )
    .filter((base) => base !== undefined)
    .map(resolvedFile)
    .filter((file) => file !== undefined);
}

/**
 * Every string the app config spells as a literal, and every string a local
 * file it imports spells, through re-exports too: a logo slot may name its
 * path through a constant of another file. A path built at runtime is not
 * seen.
 */
export function reachableStringLiterals(appConfig: SourceFile): Set<string> {
  const appDirectory = path.dirname(appConfig.getFilePath());
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true },
  });
  const literals = stringLiterals(appConfig);
  const seen = new Set<string>();
  const pending = localImports(appConfig, appDirectory);
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const imported = project.createSourceFile(file, readable(file) ?? "");
    for (const literal of stringLiterals(imported)) {
      literals.add(literal);
    }
    pending.push(...localImports(imported, appDirectory));
  }
  return literals;
}

import path from "node:path";
import type { Project, SourceFile } from "ts-morph";
import { relativeModule } from "./emit";
import { resolveRootBarrel } from "./writable";

export function srcDir(project: Project, module?: string): string | undefined {
  const root = resolveRootBarrel(project, module);
  return root ? path.dirname(root.getFilePath()) : undefined;
}

/**
 * Resolve `dir` (relative to the src root) to an absolute path, refusing any
 * value that escapes the src tree.
 */
export function resolveWithinSrc(
  base: string,
  dir: string,
): string | undefined {
  const resolved = path.normalize(path.join(base, dir));
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    return undefined;
  }
  return resolved;
}

/**
 * The nearest ancestor barrel (`index.ts`) of `startDir`, walking up until one
 * exists; the root barrel is the ultimate fallback. Wiring this barrel keeps the
 * new folder on the re-export chain to `src/index.ts`.
 */
export function findNearestBarrel(
  project: Project,
  startDir: string,
): SourceFile | undefined {
  let dir = startDir;
  for (;;) {
    const barrel = project.getSourceFile(path.join(dir, "index.ts"));
    if (barrel) {
      return barrel;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return resolveRootBarrel(project);
    }
    dir = parent;
  }
}

/** The `export * from`/`import` specifier from `barrel` to `target`. */
export function barrelSpecifier(barrel: SourceFile, target: string): string {
  return relativeModule(barrel.getFilePath(), target);
}

/** Keep barrel exports sorted so the next formatter run introduces no extra changes. */
export function addSortedExport(barrel: SourceFile, specifier: string): void {
  const existing = barrel
    .getExportDeclarations()
    .find((entry) => (entry.getModuleSpecifierValue() ?? "") > specifier);
  if (!existing) {
    barrel.addExportDeclaration({ moduleSpecifier: specifier });
    return;
  }
  barrel.insertExportDeclaration(existing.getChildIndex(), {
    moduleSpecifier: specifier,
  });
}

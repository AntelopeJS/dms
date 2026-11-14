import { isDeepStrictEqual } from "node:util";
import type {
  ConfigObject,
  EditableCategoryMeta,
  EditablePageMeta,
} from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression, type SourceFile } from "ts-morph";
import { optionValue } from "./config-literal";
import { propertyKey } from "./paths";
import { type EmitContext, serializeValue } from "./value";
import { pruneUnusedLocals, referencedLocalNames } from "./local-bindings";
import { pruneUnusedImports, referencedImportNames } from "./writable";

type OptionsPatchValue =
  | EditablePageMeta[keyof EditablePageMeta]
  | EditableCategoryMeta[keyof EditableCategoryMeta];

/**
 * A patch of a page's or a category's own options, as the wire carries it.
 *
 * JSON has no `undefined`: an option the editor clears — a page's permission,
 * its position — arrives as `null`, which no option of a page means. It is
 * read as what the editor meant, an option to take out of the file, rather
 * than written as a `null` the page's types refuse.
 *
 * An option the patch sets to the value the file already reads as is left as
 * written, so echoing what was read back does not turn a constant into its value.
 * A `displayName` the scanner cannot read reads as the page's or the category's
 * `id`, so an echo of that `id` leaves the name's code as written.
 */
export function optionsPatch(
  options: ObjectLiteralExpression,
  patch: Record<string, OptionsPatchValue>,
  id: string,
): Record<string, OptionsPatchValue> {
  const readAs = (key: string) =>
    optionValue(options, key) ?? (key === "displayName" ? id : undefined);
  return Object.fromEntries(
    Object.entries(patch)
      .map(([key, value]) => [key, value === null ? undefined : value] as const)
      .filter(
        ([key, value]) =>
          value === undefined || !isDeepStrictEqual(value, readAs(key)),
      ),
  );
}

/**
 * Runs `write`, then drops each local or import that only what `write`
 * replaced or removed read, and whatever only that local read, so the file
 * stays free of unused bindings. A binding unused before `write` stays.
 */
export function pruningOrphans<T>(sourceFile: SourceFile, write: () => T): T {
  const usedLocals = referencedLocalNames(sourceFile);
  const usedImports = referencedImportNames(sourceFile);
  const result = write();
  pruneUnusedLocals(sourceFile, usedLocals);
  pruneUnusedImports(sourceFile, usedImports);
  return result;
}

/**
 * {@link writePatch}, then the bindings only a replaced or removed value read
 * are dropped, as {@link pruningOrphans} drops them.
 */
export function applyPatch(
  obj: ObjectLiteralExpression,
  patch: ConfigObject,
  replace: boolean,
  ctx: EmitContext,
): void {
  pruningOrphans(obj.getSourceFile(), () =>
    writePatch(obj, patch, replace, ctx),
  );
}

/**
 * Writes `patch` into an object literal: an `undefined` value removes its key,
 * any other value replaces the key's member in place, shorthand included, or is
 * added. Bindings the old values read are left as they are.
 */
export function writePatch(
  obj: ObjectLiteralExpression,
  patch: ConfigObject,
  replace: boolean,
  ctx: EmitContext,
): void {
  const initializers = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    initializers.set(
      key,
      value === undefined ? undefined : serializeValue(value, ctx),
    );
  }
  if (replace) {
    for (const prop of obj.getProperties()) {
      prop.remove();
    }
  }
  for (const [key, initializer] of initializers) {
    const existing = obj.getProperty(key);
    if (initializer === undefined) {
      existing?.remove();
      continue;
    }
    if (existing && Node.isPropertyAssignment(existing)) {
      existing.setInitializer(initializer);
    } else if (existing && Node.isShorthandPropertyAssignment(existing)) {
      existing.replaceWithText(`${propertyKey(key)}: ${initializer}`);
    } else {
      obj.addPropertyAssignment({ name: propertyKey(key), initializer });
    }
  }
}

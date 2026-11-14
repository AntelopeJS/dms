import type {
  ConfigObject,
  EditableCategoryMeta,
  EditablePageMeta,
} from "@antelopejs/interface-dms-builder";
import {
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
} from "ts-morph";
import { propertyKey } from "./paths";
import { type EmitContext, serializeValue } from "./value";
import { pruneUnusedImports, pruneUnusedLocals } from "./writable";

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
 */
export function optionsPatch(
  patch: Record<string, OptionsPatchValue>,
): Record<string, OptionsPatchValue> {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      key,
      value === null ? undefined : value,
    ]),
  );
}

/**
 * Writes `patch` into an object literal: an `undefined` value removes its key,
 * any other value replaces the key's member in place, shorthand included, or is
 * added. A local or named import that only a replaced or removed shorthand read
 * is then dropped, so the file stays free of unused bindings.
 */
export function applyPatch(
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
  const shorthandBindings = new Set<string>();
  const remove = (prop: ObjectLiteralElementLike): void => {
    if (Node.isShorthandPropertyAssignment(prop)) {
      shorthandBindings.add(prop.getName());
    }
    prop.remove();
  };
  if (replace) {
    for (const prop of obj.getProperties()) {
      remove(prop);
    }
  }
  for (const [key, initializer] of initializers) {
    const existing = obj.getProperty(key);
    if (initializer === undefined) {
      if (existing) {
        remove(existing);
      }
      continue;
    }
    if (existing && Node.isPropertyAssignment(existing)) {
      existing.setInitializer(initializer);
    } else if (existing && Node.isShorthandPropertyAssignment(existing)) {
      shorthandBindings.add(existing.getName());
      existing.replaceWithText(`${propertyKey(key)}: ${initializer}`);
    } else {
      obj.addPropertyAssignment({ name: propertyKey(key), initializer });
    }
  }
  const sourceFile = obj.getSourceFile();
  pruneUnusedLocals(sourceFile, shorthandBindings);
  pruneUnusedImports(sourceFile, shorthandBindings);
}

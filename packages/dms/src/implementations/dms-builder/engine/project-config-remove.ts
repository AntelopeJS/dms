import type {
  RemoveConnectionStep,
  RemoveModuleStep,
} from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { propertyKey } from "./modules";
import {
  type ConfigDraft,
  ENV_OVERRIDES,
  IMPORT_OVERRIDES,
  MODULES,
  moduleEntries,
  objectAt,
  propertyNamed,
  refuse,
  replace,
  stringOf,
} from "./project-config";
import { mayNameSource, writtenModules } from "./project-config-readers";

const LINE_REST = /^[ \t]*/;
const TRAILING_COMMA = /^[ \t]*,/;
const LEADING_COMMA = /,[ \t]*$/;

function lineBounds(text: string, start: number, end: number) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const newline = text.indexOf("\n", end);
  const lineEnd = newline === -1 ? text.length : newline;
  return { lineStart, lineEnd };
}

/** Removes a property or an array element, with its comma: its whole line when it has one to itself. */
function removeNode(draft: ConfigDraft, node: Node): void {
  const text = draft.file.getFullText();
  let start = node.getStart();
  let end = node.getEnd();
  const comma = TRAILING_COMMA.exec(text.slice(end));
  end += comma ? comma[0].length : 0;
  const { lineStart, lineEnd } = lineBounds(text, start, end);
  const alone =
    text.slice(lineStart, start).trim() === "" &&
    text.slice(end, lineEnd).trim() === "";
  if (alone) {
    start = lineStart;
    end = Math.min(lineEnd + 1, text.length);
  } else if (comma) {
    end += LINE_REST.exec(text.slice(end))?.[0].length ?? 0;
  } else {
    start -= LEADING_COMMA.exec(text.slice(lineStart, start))?.[0].length ?? 0;
  }
  replace(draft, start, end, "");
}

/** Removes `key` from the object at `path`. */
function removeProperty(draft: ConfigDraft, path: string[], key: string): void {
  const owner =
    objectAt(draft, path) ?? refuse(`could not find ${path.join(".")}`);
  removeNode(
    draft,
    propertyNamed(owner, key) ??
      refuse(`could not find ${[...path, key].join(".")}`),
  );
}

function variablesSupplying(draft: ConfigDraft, id: string): string[] {
  const overrides = objectAt(draft, [ENV_OVERRIDES]);
  const prefix = `${MODULES}.${id}.`;
  return (overrides?.getProperties() ?? [])
    .filter(Node.isPropertyAssignment)
    .filter((property) =>
      stringOf(property.getInitializer())?.startsWith(prefix),
    )
    .map((property) => propertyKey(property.getNameNode()));
}

export function removeModule(draft: ConfigDraft, step: RemoveModuleStep): void {
  if (!objectAt(draft, [MODULES, step.id])) {
    refuse(`the project has no module "${step.id}"`);
  }
  const users = writtenModules(draft)
    .filter(
      ([id, entry]) =>
        id !== step.id &&
        mayNameSource(entry, step.id, { through: draft.sourceInterfaces }),
    )
    .map(([id]) => `"${id}"`);
  if (users.length > 0) {
    refuse(
      `module "${step.id}" is still a source in the importOverrides of ${users.join(", ")}`,
    );
  }
  for (const variable of variablesSupplying(draft, step.id)) {
    removeProperty(draft, [ENV_OVERRIDES], variable);
  }
  removeProperty(draft, [MODULES], step.id);
}

/** The elements of a module's `importOverrides` array that declare the connection, as written. */
function connectionElements(
  entry: ObjectLiteralExpression,
  step: RemoveConnectionStep,
): ObjectLiteralExpression[] {
  const overrides = propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer();
  if (!Node.isArrayLiteralExpression(overrides)) {
    return [];
  }
  return overrides
    .getElements()
    .filter(Node.isObjectLiteralExpression)
    .filter(
      (element) =>
        stringOf(propertyNamed(element, "interface")?.getInitializer()) ===
          step.interface &&
        stringOf(propertyNamed(element, "id")?.getInitializer()) === step.id,
    );
}

function holdersOf(draft: ConfigDraft, step: RemoveConnectionStep): string[] {
  return moduleEntries(draft)
    .filter(([, entry]) => connectionElements(entry, step).length > 0)
    .map(([id]) => id);
}

/**
 * Removes the connection's element from each `importOverrides` that declares it, and leaves every
 * other element, comment and spelling as written; an array left empty goes with it.
 */
export function removeConnection(
  draft: ConfigDraft,
  step: RemoveConnectionStep,
): void {
  const holders = holdersOf(draft, step);
  if (holders.length === 0) {
    refuse(`no module has a connection "${step.id}" to ${step.interface}`);
  }
  for (const id of holders) {
    const entry = () =>
      objectAt(draft, [MODULES, id]) ?? refuse(`could not find ${id}`);
    let [element] = connectionElements(entry(), step);
    while (element) {
      removeNode(draft, element);
      [element] = connectionElements(entry(), step);
    }
    const overrides = propertyNamed(
      entry(),
      IMPORT_OVERRIDES,
    )?.getInitializer();
    if (
      Node.isArrayLiteralExpression(overrides) &&
      overrides.getElements().length === 0
    ) {
      removeProperty(draft, [MODULES, id], IMPORT_OVERRIDES);
    }
  }
}

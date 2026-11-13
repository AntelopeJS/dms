import type {
  ConfigValue,
  CreateLocalModuleStep,
  ImportOverrideInput,
  ModuleEntryInput,
} from "@antelopejs/interface-dms-builder";
import { Node } from "ts-morph";
import { VARIABLE_NAME } from "./env-lines";
import { heldAt } from "./held-value";
import {
  hides,
  overridesWrittenAsLiterals,
  shorthandNamed,
} from "./literal-overrides";
import {
  type ConfigDraft,
  ENV_OVERRIDES,
  existingOverrides,
  IMPORT_OVERRIDES,
  MODULES,
  objectAt,
  propertyNamed,
  refuse,
  refuseUnreadable,
  setProperty,
  stringOf,
} from "./project-config";
import { scaffoldLocalModule } from "./project-scaffold";
import { isPlainObject } from "./value";

const DISABLED_EXPORTS = "disabledExports";

function ensureObject(draft: ConfigDraft, path: string[]): void {
  if (!objectAt(draft, path)) {
    setProperty(draft, path.slice(0, -1), path[path.length - 1], {});
  }
}

/**
 * Sets `key` on the object at `path`, which starts at a module's entry. An object value is merged
 * key by key into an object literal the property already holds, so the keys it does not name stay,
 * and replaces a scalar or an array. It is refused where the property holds an object with a
 * spread or a value that is not a literal: replacing that would lose what the builder cannot read.
 * Any other value replaces the property.
 */
function mergeProperty(
  draft: ConfigDraft,
  path: string[],
  key: string,
  value: ConfigValue,
): void {
  if (!isPlainObject(value)) {
    setProperty(draft, path, key, value);
    return;
  }
  const held = heldAt(objectAt(draft, path), key);
  if (held === "unreadable") {
    refuseUnreadable(path, key);
  }
  if (held === "replace") {
    setProperty(draft, path, key, value);
    return;
  }
  for (const [nested, item] of Object.entries(value)) {
    mergeProperty(draft, [...path, key], nested, item);
  }
}

function mergeValues(
  draft: ConfigDraft,
  path: string[],
  values: ModuleEntryInput["config" | "exportPriority"],
): void {
  if (!values || Object.keys(values).length === 0) {
    return;
  }
  ensureObject(draft, path);
  for (const [key, value] of Object.entries(values)) {
    mergeProperty(draft, path, key, value);
  }
}

/** Names each variable in `envOverrides`, refusing one that already supplies another path. */
function bindVariables(
  draft: ConfigDraft,
  id: string,
  env: Record<string, string> | undefined,
): void {
  if (!env || Object.keys(env).length === 0) {
    return;
  }
  ensureObject(draft, [ENV_OVERRIDES]);
  for (const [configPath, variable] of Object.entries(env)) {
    if (!VARIABLE_NAME.test(variable)) {
      refuse(`${variable} is not a variable name`);
    }
    const target = `${MODULES}.${id}.config.${configPath}`;
    const overrides =
      objectAt(draft, [ENV_OVERRIDES]) ??
      refuse("could not write envOverrides");
    const current = stringOf(
      propertyNamed(overrides, variable)?.getInitializer(),
    );
    if (current !== undefined && current !== target) {
      refuse(
        `${variable} already supplies ${current}; choose another variable for ${target}`,
      );
    }
    setProperty(draft, [ENV_OVERRIDES], variable, target);
    draft.variables.push(variable);
  }
}

function describeBinding(entry: ImportOverrideInput): string {
  return entry.id ? `${entry.interface} (${entry.id})` : entry.interface;
}

/**
 * Where an override goes: an entry without an id ahead of the first entry of its interface that
 * has one, so an interface's plain binding precedes its named connections; any other at the end.
 */
function insertionIndex(
  merged: ImportOverrideInput[],
  entry: ImportOverrideInput,
): number {
  if (entry.id !== undefined) {
    return merged.length;
  }
  const named = merged.findIndex(
    (candidate) =>
      candidate.interface === entry.interface && candidate.id !== undefined,
  );
  return named === -1 ? merged.length : named;
}

/** The overrides after adding `added`, refusing a pin or connection that contradicts one. */
function mergedOverrides(
  module: string,
  current: ImportOverrideInput[],
  added: ImportOverrideInput[],
): ImportOverrideInput[] {
  const merged = [...current];
  for (const entry of added) {
    const existing = merged.find(
      (candidate) =>
        candidate.interface === entry.interface && candidate.id === entry.id,
    );
    if (existing && existing.source !== entry.source) {
      refuse(
        `module "${module}" already binds ${describeBinding(entry)} to "${existing.source}", not "${entry.source}"`,
      );
    }
    if (!existing) {
      merged.splice(insertionIndex(merged, entry), 0, entry);
    }
  }
  return merged;
}

/** The pins-only spelling when nothing needs more, the array spelling otherwise. */
function overridesValue(entries: ImportOverrideInput[]): ConfigValue {
  if (
    entries.every(
      (entry) => entry.id === undefined && entry.source !== undefined,
    )
  ) {
    return Object.fromEntries(
      entries.map((entry) => [entry.interface, entry.source]),
    );
  }
  return entries.map((entry) => ({
    interface: entry.interface,
    source: entry.source,
    id: entry.id,
  }));
}

function mergeOverrides(
  draft: ConfigDraft,
  id: string,
  added: ImportOverrideInput[],
): void {
  if (added.length === 0) {
    return;
  }
  const entry =
    objectAt(draft, [MODULES, id]) ??
    refuse(`the project has no module "${id}"`);
  const written = propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer();
  if (hides(entry, IMPORT_OVERRIDES) || !overridesWrittenAsLiterals(written)) {
    refuse(
      `the importOverrides of module "${id}" are not written with literals only, and writing them again would lose a part: add ${added.map(describeBinding).join(", ")} there by hand`,
    );
  }
  const current = existingOverrides(written);
  const merged = mergedOverrides(id, current, added);
  setProperty(draft, [MODULES, id], IMPORT_OVERRIDES, overridesValue(merged));
}

function existingStrings(initializer: Node, id: string): string[] {
  const elements = Node.isArrayLiteralExpression(initializer)
    ? initializer.getElements().map(stringOf)
    : [undefined];
  return elements.map(
    (element) =>
      element ??
      refuse(
        `"${DISABLED_EXPORTS}" of module "${id}" is not a list of plain strings: edit it by hand`,
      ),
  );
}

function mergeDisabledExports(
  draft: ConfigDraft,
  id: string,
  added: string[],
): void {
  if (added.length === 0) {
    return;
  }
  const entry =
    objectAt(draft, [MODULES, id]) ??
    refuse(`the project has no module "${id}"`);
  if (shorthandNamed(entry, DISABLED_EXPORTS)) {
    refuseUnreadable([MODULES, id], DISABLED_EXPORTS);
  }
  const current = propertyNamed(entry, DISABLED_EXPORTS)?.getInitializer();
  const existing = current ? existingStrings(current, id) : [];
  setProperty(draft, [MODULES, id], DISABLED_EXPORTS, [
    ...new Set([...existing, ...added]),
  ]);
}

export function writeEntry(
  draft: ConfigDraft,
  id: string,
  entry: ModuleEntryInput,
): void {
  if (!objectAt(draft, [MODULES, id])) {
    refuse(`the project has no module "${id}"`);
  }
  if (entry.source) {
    setProperty(draft, [MODULES, id], "source", entry.source);
  }
  mergeValues(draft, [MODULES, id, "config"], entry.config);
  mergeOverrides(draft, id, entry.importOverrides ?? []);
  mergeValues(draft, [MODULES, id, "exportPriority"], entry.exportPriority);
  mergeDisabledExports(draft, id, entry.disabledExports ?? []);
  bindVariables(draft, id, entry.env);
}

export function addModule(
  draft: ConfigDraft,
  id: string,
  entry: ModuleEntryInput,
): void {
  const modules =
    objectAt(draft, [MODULES]) ??
    refuse("the configuration has no modules literal");
  if (propertyNamed(modules, id)) {
    refuse(`the project already has a module "${id}"`);
  }
  if (!entry.source) {
    refuse(`module "${id}" needs a source`);
  }
  setProperty(draft, [MODULES], id, {});
  writeEntry(draft, id, entry);
}

export function createLocalModule(
  draft: ConfigDraft,
  step: CreateLocalModuleStep,
): void {
  const scaffold = scaffoldLocalModule(step.id, step.path, step.connection);
  draft.scaffolds.push(scaffold);
  addModule(draft, step.id, { ...step.entry, source: scaffold.source });
}

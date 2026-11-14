import fs from "node:fs";
import type {
  ConfigValue,
  ImportOverrideInput,
} from "@antelopejs/interface-dms-builder";
import {
  type ArrayLiteralExpression,
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import {
  hasUnreadableMember,
  isPlainObjectLiteral,
  shorthandNamed,
} from "./literal-overrides";
import { configObject, propertyKey } from "./modules";
import { indentationText, resolveProjectRoot } from "./project";
import { keyText, literalText } from "./project-config-text";
import type { Scaffold } from "./project-scaffold";
import { isPlainObject } from "./value";

export const ENV_OVERRIDES = "envOverrides";
export const MODULES = "modules";
export const IMPORT_OVERRIDES = "importOverrides";

/**
 * The configuration being edited, in memory until every step has been accepted. Edits are text
 * edits, after which every node is found again by its path from the configuration's root.
 */
export interface ConfigDraft {
  path: string;
  before: string;
  file: SourceFile;
  unit: string;
  scaffolds: Scaffold[];
  variables: string[];
  /** Files other than the configuration a step rewrites, with their content before. */
  edits: FileEdit[];
  /**
   * The only interfaces a module this batch removes can be a source through, when the caller
   * knows them: an override of another interface whose source is not a literal does not hold it.
   */
  sourceInterfaces?: ReadonlySet<string>;
}

/** A file a step rewrites whole. */
export interface FileEdit {
  path: string;
  before: string;
  content: string;
}

/** A step the configuration cannot take, with the reason the caller is told. */
export class StepRefusal extends Error {}

export function refuse(message: string): never {
  throw new StepRefusal(message);
}

/** The property JavaScript keeps for `name`: the last one written. */
export function propertyNamed(
  owner: ObjectLiteralExpression,
  name: string,
): PropertyAssignment | undefined {
  return owner
    .getProperties()
    .filter(Node.isPropertyAssignment)
    .findLast((property) => propertyKey(property.getNameNode()) === name);
}

/**
 * The one property of the object written as `name: value`, or nothing when none is. Refuses a
 * key written twice, since an edit of either copy may not be the one that takes effect, and one
 * written as a shorthand, a method or an accessor.
 */
export function soleProperty(
  owner: ObjectLiteralExpression,
  name: string,
  where: string,
): PropertyAssignment | undefined {
  const property = soleMember(owner, name, where);
  if (property !== undefined && !Node.isPropertyAssignment(property)) {
    refuse(`"${where}" in the configuration is not written as \`key: value\``);
  }
  return property;
}

/** The one member of the object named `name`, whatever its form, refusing a key written twice. */
function soleMember(
  owner: ObjectLiteralExpression,
  name: string,
  where: string,
): ObjectLiteralElementLike | undefined {
  const copies = owner.getProperties().filter((property) => {
    const nameNode = Node.isSpreadAssignment(property)
      ? undefined
      : property.getNameNode();
    return nameNode !== undefined && propertyKey(nameNode) === name;
  });
  if (copies.length > 1) {
    refuse(
      `"${where}" is written ${copies.length} times in the configuration; keep one`,
    );
  }
  return copies[0];
}

/** The object literal `node`, written at `key` of the object at `path`, refused when it has a spread. */
function plainObject(
  node: Node | undefined,
  path: string[],
  key: string,
): ObjectLiteralExpression {
  if (
    !Node.isObjectLiteralExpression(node) ||
    node.getProperties().some(Node.isSpreadAssignment)
  ) {
    refuseUnreadable(path, key);
  }
  return node;
}

function rootObject(draft: ConfigDraft): ObjectLiteralExpression {
  return plainObject(configObject(draft.file), [], "export default");
}

/** The object literal at `path` from the configuration's root, or nothing when a key is absent. */
export function objectAt(
  draft: ConfigDraft,
  path: string[],
): ObjectLiteralExpression | undefined {
  let current = rootObject(draft);
  for (const [index, key] of path.entries()) {
    const where = path.slice(0, index + 1).join(".");
    const member = soleMember(current, key, where);
    if (!member) {
      return undefined;
    }
    if (!Node.isPropertyAssignment(member)) {
      refuseUnreadable(path.slice(0, index), key);
    }
    current = plainObject(member.getInitializer(), path.slice(0, index), key);
  }
  return current;
}

function indentAt(text: string, position: number): string {
  const lineStart = text.lastIndexOf("\n", position - 1) + 1;
  return text.slice(lineStart).replace(/[^\t ][\s\S]*$/, "");
}

/** How much deeper than its object's line the first property on a later line starts, if it does. */
function nestingStep(text: string, owner: ObjectLiteralExpression) {
  const base = indentAt(text, owner.getStart());
  const property = owner
    .getProperties()
    .find((each) => each.getStartLineNumber() > owner.getStartLineNumber());
  const indent = property && indentAt(text, property.getStart());
  return indent && indent.length > base.length && indent.startsWith(base)
    ? indent.slice(base.length)
    : undefined;
}

/**
 * The indent unit the configuration's own object literals use: the smallest step from an object's
 * line to a property on a later line, so a comment's lines are never measured. The file's own
 * layout outranks the project's, which may say nothing.
 */
function configIndent(file: SourceFile): string | undefined {
  const root = configObject(file);
  if (!root) {
    return undefined;
  }
  const text = file.getFullText();
  return [
    root,
    ...root.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression),
  ]
    .map((owner) => nestingStep(text, owner))
    .filter((step) => step !== undefined)
    .reduce<string | undefined>(
      (smallest, step) =>
        smallest === undefined || step.length < smallest.length
          ? step
          : smallest,
      undefined,
    );
}

/** Opens the configuration for editing, refusing one the builder cannot edit safely. */
export function openDraft(configPath: string): ConfigDraft {
  const before = fs.readFileSync(configPath, "utf8");
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    configPath,
    before,
  );
  const draft: ConfigDraft = {
    path: configPath,
    before,
    file,
    unit: configIndent(file) ?? indentationText(resolveProjectRoot()),
    scaffolds: [],
    variables: [],
    edits: [],
  };
  if (!configObject(file)) {
    refuse("the configuration is not an exported defineConfig({ … }) literal");
  }
  if (!objectAt(draft, [MODULES])) {
    refuse("the configuration has no modules literal");
  }
  return draft;
}

function lineIndent(draft: ConfigDraft, node: Node): string {
  return indentAt(draft.file.getFullText(), node.getStart());
}

export function replace(
  draft: ConfigDraft,
  start: number,
  end: number,
  text: string,
): void {
  draft.file.replaceText([start, end], text);
}

/** A literal written for a property line starting with `base`. */
function rebased(value: string, base: string): string {
  return value.replace(/\n/g, `\n${base}`);
}

/** The object rewritten over several lines, so a property can be added below the others. */
function expanded(
  draft: ConfigDraft,
  owner: ObjectLiteralExpression,
  extra: string,
): string {
  const base = lineIndent(draft, owner);
  const inner = base + draft.unit;
  const lines = [
    ...owner.getProperties().map((property) => property.getText()),
    extra,
  ];
  return `{\n${lines.map((line) => `${inner}${line},`).join("\n")}\n${base}}`;
}

function isMultiline(owner: ObjectLiteralExpression): boolean {
  return owner.getStartLineNumber() !== owner.getEndLineNumber();
}

/** Adds `key: value` as the last property of the object at `path`, in the file's own layout. */
function addProperty(
  draft: ConfigDraft,
  path: string[],
  key: string,
  value: string,
): void {
  const owner =
    objectAt(draft, path) ?? refuse(`could not find ${path.join(".")}`);
  const properties = owner.getProperties();
  if (properties.length === 0 || !isMultiline(owner)) {
    const inner = lineIndent(draft, owner) + draft.unit;
    const property = `${keyText(key)}: ${rebased(value, inner)}`;
    replace(
      draft,
      owner.getStart(),
      owner.getEnd(),
      expanded(draft, owner, property),
    );
    return;
  }
  const last = properties[properties.length - 1];
  const indent = lineIndent(draft, last);
  const following = /^\s*,/.exec(draft.file.getFullText().slice(last.getEnd()));
  const at = following ? last.getEnd() + following[0].length : last.getEnd();
  const lead = following ? "" : ",";
  replace(
    draft,
    at,
    at,
    `${lead}\n${indent}${keyText(key)}: ${rebased(value, indent)},`,
  );
}

/**
 * Sets `key` on the object at `path`, replacing its value when present. A shorthand member of that
 * name is replaced by an assignment, unless the value is an object: the shorthand's value is a
 * variable the builder cannot read. An object holding a member under a name the builder cannot
 * read, a computed name, a method or an accessor, may hold `key` there, so it is refused.
 */
export function setProperty(
  draft: ConfigDraft,
  path: string[],
  key: string,
  value: ConfigValue,
): void {
  const owner =
    objectAt(draft, path) ?? refuse(`could not find ${path.join(".")}`);
  const shorthand = shorthandNamed(owner, key);
  if (hasUnreadableMember(owner) || (shorthand && isPlainObject(value))) {
    refuseUnreadable(path, key);
  }
  soleMember(owner, key, [...path, key].join("."));
  const literal = literalText(value, draft.unit);
  if (shorthand) {
    const text = rebased(literal, lineIndent(draft, shorthand));
    replace(
      draft,
      shorthand.getStart(),
      shorthand.getEnd(),
      `${keyText(key)}: ${text}`,
    );
    return;
  }
  const existing = propertyNamed(owner, key);
  if (!existing) {
    addProperty(draft, path, key, literal);
    return;
  }
  const initializer = existing.getInitializerOrThrow();
  const text = rebased(literal, lineIndent(draft, existing));
  replace(draft, initializer.getStart(), initializer.getEnd(), text);
}

export function stringOf(node: Node | undefined): string | undefined {
  return Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
    ? node.getLiteralValue()
    : undefined;
}

/** Where `key` of the object at `path` sits: by its key path in a module's entry, else from the root. */
function locate(path: string[], key: string): string {
  const [head, module, ...inside] = path;
  if (head !== MODULES) {
    return `"${[...path, key].join(".")}" in the configuration`;
  }
  return module === undefined
    ? `module "${key}"`
    : `${[...inside, key].join(".")} of module "${module}"`;
}

/** Refuses a write to `key` of the object at `path`, held where the builder cannot read what it would replace. */
export function refuseUnreadable(path: string[], key: string): never {
  return refuse(
    `${locate(path, key)} is held in a way the builder cannot read (a variable, a spread, a computed name, a method or an accessor), so writing it again would lose a part: write it as a plain object literal with plain names there, then try again`,
  );
}

/** The overrides a module already declares, from either spelling `importOverrides` takes. */
export function existingOverrides(
  initializer: Node | undefined,
): ImportOverrideInput[] {
  if (Node.isObjectLiteralExpression(initializer)) {
    return initializer
      .getProperties()
      .filter(Node.isPropertyAssignment)
      .map((property) => ({
        interface: propertyKey(property.getNameNode()),
        source: stringOf(property.getInitializer()),
      }));
  }
  return Node.isArrayLiteralExpression(initializer)
    ? overridesOfArray(initializer)
    : [];
}

export function overrideOf(element: Node): ImportOverrideInput {
  const entry = plainObject(element, [], IMPORT_OVERRIDES);
  return {
    interface:
      stringOf(propertyNamed(entry, "interface")?.getInitializer()) ?? "",
    source: stringOf(propertyNamed(entry, "source")?.getInitializer()),
    id: stringOf(propertyNamed(entry, "id")?.getInitializer()),
  };
}

function overridesOfArray(
  array: ArrayLiteralExpression,
): ImportOverrideInput[] {
  return array.getElements().map(overrideOf);
}

/**
 * Each module entry of the configuration written as a plain object literal, by id. An entry
 * written otherwise, a version string or a spread, is left out: nothing the builder reads is there.
 */
export function moduleEntries(
  draft: ConfigDraft,
): [string, ObjectLiteralExpression][] {
  const entries: [string, ObjectLiteralExpression][] = [];
  const modules = objectAt(draft, [MODULES]);
  for (const property of modules?.getProperties() ?? []) {
    if (
      !Node.isPropertyAssignment(property) ||
      Node.isComputedPropertyName(property.getNameNode())
    ) {
      continue;
    }
    const entry = property.getInitializer();
    if (isPlainObjectLiteral(entry)) {
      entries.push([propertyKey(property.getNameNode()), entry]);
    }
  }
  return entries;
}

/** The `importOverrides` a module entry declares. */
export function overridesOf(entry: ObjectLiteralExpression) {
  return existingOverrides(
    propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer(),
  );
}

/**
 * The `importOverrides` a module entry declares as plain literals, for a reader: an element written
 * any other way is left out instead of refused, since no connection the builder wrote is there.
 */
export function readableOverrides(
  entry: ObjectLiteralExpression,
): ImportOverrideInput[] {
  const overrides = propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer();
  if (!Node.isArrayLiteralExpression(overrides)) {
    return existingOverrides(overrides);
  }
  return overrides
    .getElements()
    .filter(
      (element) =>
        Node.isObjectLiteralExpression(element) &&
        !element.getProperties().some(Node.isSpreadAssignment),
    )
    .map(overrideOf);
}

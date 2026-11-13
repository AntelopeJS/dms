import type { InterfaceConnection } from "@antelopejs/interface-core";
import type { ImportOverrideInput } from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression, SyntaxKind } from "ts-morph";
import { propertyKey, propertyNamed } from "./modules";
import { moduleConnections, ownModuleId } from "./own-connections";
import { DATABASE_INTERFACE } from "./interface-ids";
import {
  existingOverrides,
  overrideOf,
  MODULES,
  objectAt,
  StepRefusal,
} from "./project-config";
import { readableConfig, writtenModules } from "./project-config-readers";
import {
  hasUnreadableMember,
  hides,
  isPlainObjectLiteral,
  overridesWrittenAsLiterals,
  readableTail,
} from "./literal-overrides";

const DEFAULT_PRIORITY = 0;
const EXPORT_PRIORITY = "exportPriority";
const IMPORT_OVERRIDES = "importOverrides";

/**
 * The `interface-database` pin a module needs once a module that uses it pins another database:
 * core passes that pin on to the modules that import it, which would then be reached with two
 * bindings.
 */
export interface DatabasePin {
  module: string;
  provider: string;
}

/**
 * The project's own database, and the modules that must be pinned to it before a second
 * `interface-database` provider joins the project.
 */
export interface DatabasePins {
  /** Core's default `interface-database` provider; nothing when the project has none. */
  ownDatabase?: string;
  /** Each configured module that imports `interface-database` without providing or pinning it. */
  pins: DatabasePin[];
}

type ConnectionLookup = (
  moduleId: string,
  interfaceId: string,
) => InterfaceConnection[];

/** A priority written as a number, signed or not; nothing for anything core would have to evaluate. */
function priorityValue(node: Node | undefined): number | undefined {
  if (Node.isNumericLiteral(node)) {
    return Number(node.getText().replace(/_/g, ""));
  }
  if (
    Node.isPrefixUnaryExpression(node) &&
    Node.isNumericLiteral(node.getOperand())
  ) {
    const value = priorityValue(node.getOperand());
    const operator = node.getOperatorToken();
    if (operator === SyntaxKind.MinusToken) {
      return value === undefined ? undefined : -value;
    }
    return operator === SyntaxKind.PlusToken ? value : undefined;
  }
  return undefined;
}

/**
 * A provider's `interface-database` priority as core would rank it, or nothing when the
 * configuration does not spell it as a plain number the builder can read.
 */
export function databasePriority(entry: Node | undefined): number | undefined {
  if (entry === undefined || Node.isStringLiteral(entry)) {
    return DEFAULT_PRIORITY;
  }
  if (!Node.isObjectLiteralExpression(entry) || hides(entry, EXPORT_PRIORITY)) {
    return undefined;
  }
  const priorities = propertyNamed(entry, EXPORT_PRIORITY);
  if (priorities === undefined) {
    return DEFAULT_PRIORITY;
  }
  if (
    !Node.isObjectLiteralExpression(priorities) ||
    priorities
      .getProperties()
      .some(
        (property) =>
          !Node.isPropertyAssignment(property) ||
          Node.isComputedPropertyName(property.getNameNode()),
      )
  ) {
    return undefined;
  }
  const priority = propertyNamed(priorities, DATABASE_INTERFACE);
  return priority === undefined ? DEFAULT_PRIORITY : priorityValue(priority);
}

function unreadable(): never {
  throw new StepRefusal(
    `the configuration does not say plainly which database the project uses by default, so the modules that import ${DATABASE_INTERFACE} cannot be pinned to it: pin ${DATABASE_INTERFACE} on each of them first`,
  );
}

/**
 * Core's default provider among `providers`: the highest `exportPriority`, the first id on a tie;
 * nothing when a priority cannot be read.
 */
export function defaultDatabaseProvider(
  providers: string[],
  priorityOf: (id: string) => number | undefined,
): string | undefined {
  const ranked: { id: string; priority: number }[] = [];
  for (const id of providers) {
    const priority = priorityOf(id);
    if (priority === undefined) {
      return undefined;
    }
    ranked.push({ id, priority });
  }
  ranked.sort(
    (left, right) =>
      right.priority - left.priority || left.id.localeCompare(right.id),
  );
  return ranked[0]?.id;
}

/** Whether `overrides` holds a plain pin of `interface-database`, written as a literal override without an id. */
function pinsIn(overrides: Node | undefined): boolean {
  return readableOverrides(overrides).some(
    (override) =>
      override.interface === DATABASE_INTERFACE && override.id === undefined,
  );
}

/**
 * Whether an entry the builder cannot read in full pins `interface-database` all the same: a plain
 * pin in `importOverrides` written after the entry's last member with an unreadable name is what the
 * module runs with, whatever a spread before it holds.
 */
function pinsAfterUnreadable(entry: Node | undefined): boolean {
  if (!Node.isObjectLiteralExpression(entry)) {
    return false;
  }
  const overrides = readableTail(entry)
    .filter(Node.isPropertyAssignment)
    .find(
      (property) => propertyKey(property.getNameNode()) === IMPORT_OVERRIDES,
    )
    ?.getInitializer();
  return pinsIn(overrides);
}

/**
 * Whether a module pins `interface-database` itself, by an override without an id written as
 * literals: a named connection is not a pin. When it does not, a pin has to be written there, which
 * is refused when its overrides are not written with literals only: the builder can neither tell
 * they hold no pin nor write them again whole.
 */
function pinsDatabase(id: string, entry: ObjectLiteralExpression): boolean {
  const overrides = propertyNamed(entry, IMPORT_OVERRIDES);
  if (pinsIn(overrides)) {
    return true;
  }
  if (
    hides(entry, IMPORT_OVERRIDES) ||
    !overridesWrittenAsLiterals(overrides)
  ) {
    throw new StepRefusal(
      `the entry of module "${id}" or its importOverrides are not written with literals, so the builder cannot tell whether it pins ${DATABASE_INTERFACE}, nor add the pin without losing a part: pin it on "${id}" first`,
    );
  }
  return false;
}

/** The overrides written as literal entries, those of an array or an object of strings; none otherwise. */
function readableOverrides(overrides: Node | undefined): ImportOverrideInput[] {
  if (Node.isArrayLiteralExpression(overrides)) {
    return overrides
      .getElements()
      .filter((element) => overridesWrittenAsLiterals(element))
      .map((element) => overrideOf(element));
  }
  return Node.isObjectLiteralExpression(overrides)
    ? existingOverrides(overrides).filter(
        (override) => override.source !== undefined,
      )
    : [];
}

/** Whether an environment of the configuration changes a module's `exportPriority`. */
function environmentPriorities(modules: ObjectLiteralExpression): boolean {
  const root = modules
    .getParentIfKind(SyntaxKind.PropertyAssignment)
    ?.getParent();
  const environments = Node.isObjectLiteralExpression(root)
    ? propertyNamed(root, "environments")
    : undefined;
  return environments?.getText().includes("exportPriority") ?? false;
}

/** The distinct providers among `connections`. */
function providersOf(connections: InterfaceConnection[]): string[] {
  return [
    ...new Set(
      connections.flatMap((connection) =>
        connection.provider === undefined ? [] : [connection.provider],
      ),
    ),
  ];
}

/** The default among `providers`, ranked by the priorities the configuration writes; refused when it cannot tell. */
function defaultAmong(
  modules: ObjectLiteralExpression,
  providers: string[],
): string {
  if (providers.length === 1) {
    return providers[0];
  }
  if (environmentPriorities(modules)) {
    unreadable();
  }
  return (
    defaultDatabaseProvider(providers, (id) =>
      databasePriority(propertyNamed(modules, id)),
    ) ?? unreadable()
  );
}

/**
 * Whether a module needs the pin: it imports `interface-database` and neither provides it nor
 * pins it. Refused when its entry is not an object literal with no spread, a version string or a
 * constant for one, unless a plain pin is written after its last spread; or when its overrides
 * cannot be read, so that a pin is never written without the others.
 */
function needsPin(
  lookup: ConnectionLookup,
  id: string,
  entry: Node | undefined,
  ownDatabase: string,
): boolean {
  const connections = lookup(id, DATABASE_INTERFACE);
  if (
    connections.length === 0 ||
    connections.some((connection) => connection.provider === id)
  ) {
    return false;
  }
  if (!isPlainObjectLiteral(entry)) {
    if (pinsAfterUnreadable(entry)) {
      return false;
    }
    throw new StepRefusal(
      `module "${id}" is not written as an object literal and imports ${DATABASE_INTERFACE}, so the builder cannot pin it to "${ownDatabase}": write its entry as an object with the pin, importOverrides: { "${DATABASE_INTERFACE}": "${ownDatabase}" }, then try again`,
    );
  }
  return !pinsDatabase(id, entry);
}

/**
 * The project's own database and the pins to it that connecting another one needs: each configured
 * module that imports `interface-database`, does not provide it and has no plain pin for it. Core
 * passes a module's pin on to the modules it imports, so one left unpinned would be reached with two
 * bindings once a second provider exists. Nothing is pinned when the project has no database of its
 * own. Refused when the configuration does not say plainly which database that is, or how a module
 * binds it, or when a module that needs the pin is not written as an object literal, so a
 * connection is never written with a pin to the wrong one, or without the one it needs.
 */
export function databasePins(
  lookup: ConnectionLookup = moduleConnections,
): DatabasePins {
  const draft = readableConfig();
  const modules = draft && objectAt(draft, [MODULES]);
  const providers = providersOf(lookup(ownModuleId(), DATABASE_INTERFACE));
  if (!draft || !modules || providers.length === 0) {
    return { pins: [] };
  }
  if (hasUnreadableMember(modules)) {
    throw new StepRefusal(
      `a member of the configuration's modules is written with a computed name, a method or an accessor, so the modules that import ${DATABASE_INTERFACE} cannot all be pinned to the project's database: write the name of each module as plain text, then try again`,
    );
  }
  const ownDatabase = defaultAmong(modules, providers);
  return {
    ownDatabase,
    pins: writtenModules(draft)
      .filter(([id, entry]) => needsPin(lookup, id, entry, ownDatabase))
      .map(([module]) => ({ module, provider: ownDatabase })),
  };
}

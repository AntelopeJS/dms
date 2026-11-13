import type { InterfaceConnection } from "@antelopejs/interface-core";
import type { ImportOverrideInput } from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression, SyntaxKind } from "ts-morph";
import { findConfigFile, propertyNamed } from "./modules";
import { ownConnections } from "./own-connections";
import { DATABASE_INTERFACE } from "./interface-ids";
import {
  existingOverrides,
  overrideOf,
  MODULES,
  objectAt,
  openDraft,
  StepRefusal,
} from "./project-config";
import { hides, overridesWrittenAsLiterals } from "./literal-overrides";

const DMS_INTERFACE = "@antelopejs/interface-dms";
const DEFAULT_PRIORITY = 0;
const EXPORT_PRIORITY = "exportPriority";
const IMPORT_OVERRIDES = "importOverrides";

/**
 * The `interface-database` pin the DMS module needs once a module that uses it pins another
 * database: core passes that pin on to the DMS, which would then be reached with two bindings.
 */
export interface DatabasePin {
  module: string;
  provider: string;
}

type ConnectionLookup = (interfaceId: string) => InterfaceConnection[];

function providerOf(connections: InterfaceConnection[]): string | undefined {
  const connection =
    connections.find((candidate) => candidate.selected) ?? connections[0];
  return connection?.provider;
}

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

function unreadable(dms: string): never {
  throw new StepRefusal(
    `the DMS module "${dms}" needs an ${DATABASE_INTERFACE} pin, and the configuration does not say plainly which database the project uses by default: pin ${DATABASE_INTERFACE} on "${dms}" first`,
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

/**
 * Whether the DMS pins `interface-database`, by an override written as literals. When it does not,
 * a pin has to be written there, which is refused when its entry or overrides are not written with
 * literals only: the builder can neither tell they hold no pin nor write them again whole.
 */
function pinsDatabase(dms: string, entry: Node): boolean {
  const overrides = Node.isObjectLiteralExpression(entry)
    ? propertyNamed(entry, IMPORT_OVERRIDES)
    : undefined;
  if (
    readableOverrides(overrides).some(
      (override) => override.interface === DATABASE_INTERFACE,
    )
  ) {
    return true;
  }
  if (
    !Node.isObjectLiteralExpression(entry) ||
    hides(entry, IMPORT_OVERRIDES) ||
    !overridesWrittenAsLiterals(overrides)
  ) {
    throw new StepRefusal(
      `the entry of the DMS module "${dms}" or its importOverrides are not written with literals, so the builder cannot tell whether it pins ${DATABASE_INTERFACE}, nor add the pin without losing a part: pin it on "${dms}" first`,
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

function configModules(): ObjectLiteralExpression | undefined {
  const configPath = findConfigFile();
  if (!configPath) {
    return undefined;
  }
  try {
    return objectAt(openDraft(configPath), [MODULES]);
  } catch (error) {
    if (error instanceof StepRefusal) {
      return undefined;
    }
    throw error;
  }
}

/**
 * The DMS module's pin to the project's default database, when it needs one: nothing when the
 * DMS already pins `interface-database`, provides it, or the project has no database of its own.
 * Refused when the configuration does not say plainly which database that is, or how the DMS binds
 * it, so a connection is never written with a pin to the wrong one, or without the one it needs.
 */
export function dmsDatabasePin(
  lookup: ConnectionLookup = ownConnections,
): DatabasePin | undefined {
  const dms = providerOf(lookup(DMS_INTERFACE));
  const modules = configModules();
  const entry = dms && modules && propertyNamed(modules, dms);
  if (!dms || !modules || !entry) {
    return undefined;
  }
  const providers = lookup(DATABASE_INTERFACE)
    .map((connection) => connection.provider)
    .filter((provider): provider is string => provider !== undefined);
  if (
    providers.includes(dms) ||
    providers.length === 0 ||
    pinsDatabase(dms, entry)
  ) {
    return undefined;
  }
  if (environmentPriorities(modules)) {
    unreadable(dms);
  }
  const provider =
    defaultDatabaseProvider([...new Set(providers)], (id) =>
      databasePriority(propertyNamed(modules, id)),
    ) ?? unreadable(dms);
  return { module: dms, provider };
}

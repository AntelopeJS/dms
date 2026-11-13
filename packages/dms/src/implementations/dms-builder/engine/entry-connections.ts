import type {
  EntryConnection,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { connectionAccess } from "./connection-access-config";
import { CATALOG_INTERFACE, DATABASE_INTERFACE } from "./interface-ids";
import {
  hasUnreadableMember,
  hides,
  isPlainObjectLiteral,
} from "./literal-overrides";
import { findConfigFile, propertyKey } from "./modules";
import { invalidConfig, notFound, unsupported } from "./ops";
import {
  IMPORT_OVERRIDES,
  MODULES,
  objectAt,
  openDraft,
  propertyNamed,
  refuseUnreadable,
  StepRefusal,
  stringOf,
} from "./project-config";
import { writtenModules } from "./project-config-readers";

const DATABASE_INTERFACES: ReadonlySet<string> = new Set([
  DATABASE_INTERFACE,
  CATALOG_INTERFACE,
]);
const BINDING_KEYS = ["interface", "source", "id"] as const;

type Binding = Pick<EntryConnection, "interface" | "source" | "id">;

/** Refuses the overrides of `module`, which hold a binding the builder cannot read. */
function refuseOverrides(module: string): never {
  return refuseUnreadable([MODULES, module], IMPORT_OVERRIDES);
}

/** The string literal `key` of `element` holds; nothing when absent, refused when not a literal. */
function literalAt(
  element: ObjectLiteralExpression,
  key: string,
  module: string,
): string | undefined {
  const property = propertyNamed(element, key);
  if (!property) {
    return undefined;
  }
  return stringOf(property.getInitializer()) ?? refuseOverrides(module);
}

/** One element of an `importOverrides` array, every member of it read as written. */
function bindingOf(element: Node, module: string): Binding {
  if (
    !isPlainObjectLiteral(element) ||
    BINDING_KEYS.some((key) => hides(element, key))
  ) {
    return refuseOverrides(module);
  }
  const interfaceId = literalAt(element, "interface", module);
  const source = literalAt(element, "source", module);
  if (interfaceId === undefined || source === undefined) {
    return refuseOverrides(module);
  }
  const id = literalAt(element, "id", module);
  return id === undefined
    ? { interface: interfaceId, source }
    : { interface: interfaceId, source, id };
}

/** The pins of the `{ [interface]: source }` spelling, each key and value read as written. */
function pinsOf(overrides: ObjectLiteralExpression, module: string): Binding[] {
  return overrides.getProperties().map((property) => {
    const source = Node.isPropertyAssignment(property)
      ? stringOf(property.getInitializer())
      : undefined;
    if (!Node.isPropertyAssignment(property) || source === undefined) {
      return refuseOverrides(module);
    }
    return { interface: propertyKey(property.getNameNode()), source };
  });
}

/** Every binding of `module`'s entry, refused where one is held in a way the builder cannot read. */
function bindingsOf(module: string, entry: Node | undefined): Binding[] {
  if (
    Node.isStringLiteral(entry) ||
    Node.isNoSubstitutionTemplateLiteral(entry)
  ) {
    return [];
  }
  if (!isPlainObjectLiteral(entry)) {
    return refuseUnreadable([MODULES], module);
  }
  if (hides(entry, IMPORT_OVERRIDES)) {
    return refuseOverrides(module);
  }
  const overrides = propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer();
  if (overrides === undefined) {
    return [];
  }
  if (Node.isArrayLiteralExpression(overrides)) {
    return overrides.getElements().map((element) => bindingOf(element, module));
  }
  return isPlainObjectLiteral(overrides)
    ? pinsOf(overrides, module)
    : refuseOverrides(module);
}

/** A binding with the access dms-database grants its connection, as core resolves it. */
function withAccess(binding: Binding): EntryConnection {
  return binding.id === undefined
    ? binding
    : { ...binding, access: connectionAccess(binding.id).access };
}

/**
 * The `interface-database` and `interface-database-catalog` bindings of the entry `module`, as
 * `antelope.config.ts` writes them, whether or not core loads that module. The last entry written
 * under that id is the one core reads. Runs inside `withConnectionAccess`, which resolves each
 * connection's access as dms-database receives it.
 */
export function entryConnections(module: string): OpResult<EntryConnection[]> {
  const configPath = findConfigFile();
  if (!configPath) {
    return unsupported<EntryConnection[]>(
      "the project has no antelope.config.ts",
    );
  }
  try {
    const draft = openDraft(configPath);
    const written = writtenModules(draft)
      .filter(([id]) => id === module)
      .at(-1);
    if (!written) {
      const modules = objectAt(draft, [MODULES]);
      if (modules && hasUnreadableMember(modules)) {
        refuseUnreadable([], MODULES);
      }
      return notFound<EntryConnection[]>(module);
    }
    return {
      ok: true,
      data: bindingsOf(module, written[1])
        .filter((binding) => DATABASE_INTERFACES.has(binding.interface))
        .map(withAccess),
      changes: [],
    };
  } catch (error) {
    if (error instanceof StepRefusal) {
      return invalidConfig<EntryConnection[]>(error.message);
    }
    throw error;
  }
}

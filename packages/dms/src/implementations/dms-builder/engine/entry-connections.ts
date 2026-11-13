import type {
  EntryConnection,
  ImportOverrideInput,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import { Node } from "ts-morph";
import { dmsDatabaseIn } from "./dms-database";
import { CATALOG_INTERFACE, DATABASE_INTERFACE } from "./interface-ids";
import { hasUnreadableMember, isPlainObjectLiteral } from "./literal-overrides";
import { findConfigFile } from "./modules";
import { invalidConfig, notFound, unsupported } from "./ops";
import {
  type ConfigDraft,
  existingOverrides,
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
const CONNECTIONS_PATH = ["config", "externalConnections"];
const ACCESS = "access";

/** The overrides of `module`'s entry, refused where one is held in a way the builder cannot read. */
function entryOverrides(
  module: string,
  entry: Node | undefined,
): ImportOverrideInput[] {
  if (!isPlainObjectLiteral(entry)) {
    return refuseUnreadable([MODULES], module);
  }
  const overrides = propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer();
  if (
    overrides !== undefined &&
    !Node.isArrayLiteralExpression(overrides) &&
    !isPlainObjectLiteral(overrides)
  ) {
    return refuseUnreadable([MODULES, module], IMPORT_OVERRIDES);
  }
  const read = existingOverrides(overrides);
  if (read.some(({ interface: id, source }) => !id || source === undefined)) {
    return refuseUnreadable([MODULES, module], IMPORT_OVERRIDES);
  }
  return read;
}

/** The access dms-database reads for connection `id`: `read-write` only when written so. */
function accessOf(
  draft: ConfigDraft,
  dmsDatabase: string | undefined,
  id: string,
): "read" | "read-write" {
  if (dmsDatabase === undefined) {
    return "read";
  }
  const path = [MODULES, dmsDatabase, ...CONNECTIONS_PATH, id];
  const connection = objectAt(draft, path);
  const access = connection && propertyNamed(connection, ACCESS);
  if (!connection || !access) {
    return "read";
  }
  const written = stringOf(access.getInitializer());
  if (written === "read" || written === "read-write") {
    return written;
  }
  return refuseUnreadable(path, ACCESS);
}

function connectionsOf(
  draft: ConfigDraft,
  module: string,
  entry: Node | undefined,
): EntryConnection[] {
  const dmsDatabase = dmsDatabaseIn(draft);
  return entryOverrides(module, entry).flatMap(
    ({ interface: interfaceId, source, id }): EntryConnection[] => {
      if (!DATABASE_INTERFACES.has(interfaceId) || source === undefined) {
        return [];
      }
      return id === undefined
        ? [{ interface: interfaceId, source }]
        : [
            {
              interface: interfaceId,
              source,
              id,
              access: accessOf(draft, dmsDatabase, id),
            },
          ];
    },
  );
}

/**
 * The `interface-database` and `interface-database-catalog` bindings of the entry `module`, as
 * `antelope.config.ts` writes them, whether or not core loads that module.
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
    const written = writtenModules(draft).find(([id]) => id === module);
    if (!written) {
      const modules = objectAt(draft, [MODULES]);
      if (modules && hasUnreadableMember(modules)) {
        refuseUnreadable([], MODULES);
      }
      return notFound<EntryConnection[]>(module);
    }
    return {
      ok: true,
      data: connectionsOf(draft, module, written[1]),
      changes: [],
    };
  } catch (error) {
    if (error instanceof StepRefusal) {
      return invalidConfig<EntryConnection[]>(error.message);
    }
    throw error;
  }
}

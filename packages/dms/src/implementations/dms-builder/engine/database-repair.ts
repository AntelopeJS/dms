import type {
  ImportOverrideInput,
  OpResult,
  ProjectConfigOpts,
  ProjectConfigResult,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import type { ObjectLiteralExpression } from "ts-morph";
import { databasePins } from "./database-pin";
import { dmsDatabaseIn } from "./dms-database";
import { CATALOG_INTERFACE, DATABASE_INTERFACE } from "./interface-ids";
import { findConfigFile } from "./modules";
import { invalidConfig, unsupported } from "./ops";
import { ownModuleId } from "./own-connections";
import {
  type ConfigDraft,
  moduleEntries,
  openDraft,
  readableOverrides,
  StepRefusal,
} from "./project-config";
import { configureProject } from "./project-config-ops";

type Lookup = Parameters<typeof databasePins>[0];

/** A catalog connection declared on this module's entry, with the driver that serves it. */
interface Connection {
  id: string;
  driver: string;
}

function entryOf(
  draft: ConfigDraft,
  id: string,
): ObjectLiteralExpression | undefined {
  return moduleEntries(draft).find(([entryId]) => entryId === id)?.[1];
}

/** The catalog connections this module's own entry declares, as the builder wrote them. */
function declaredConnections(draft: ConfigDraft): Connection[] {
  const own = entryOf(draft, ownModuleId());
  return (own ? readableOverrides(own) : []).flatMap(
    ({ interface: interfaceId, source, id }) =>
      interfaceId === CATALOG_INTERFACE &&
      source !== undefined &&
      id !== undefined
        ? [{ id, driver: source }]
        : [],
  );
}

/**
 * What dms-database needs of each connection: the project's own database first, which a plain
 * import of `interface-database` reaches, then the connection on both interfaces under its id.
 */
function registration(
  ownDatabase: string,
  connections: Connection[],
): ImportOverrideInput[] {
  return [
    { interface: DATABASE_INTERFACE, source: ownDatabase },
    ...connections.flatMap(({ id, driver }) => [
      { interface: DATABASE_INTERFACE, source: driver, id },
      { interface: CATALOG_INTERFACE, source: driver, id },
    ]),
  ];
}

/** The `wanted` overrides the entry does not hold yet, by interface and id: a binding it holds is left as it is. */
function missingFrom(
  entry: ObjectLiteralExpression,
  wanted: ImportOverrideInput[],
): ImportOverrideInput[] {
  const present = readableOverrides(entry);
  return wanted.filter(
    (override) =>
      !present.some(
        (held) =>
          held.interface === override.interface && held.id === override.id,
      ),
  );
}

/**
 * The steps that bring a configuration to what the connect flow writes for the connections it
 * declares: dms-database's overrides, never its `access`, which the console may have set, and the
 * pins of the modules that import `interface-database`. None when nothing is missing.
 */
function repairSteps(draft: ConfigDraft, lookup: Lookup): ProjectConfigStep[] {
  const connections = declaredConnections(draft);
  if (connections.length === 0) {
    return [];
  }
  const { ownDatabase, pins } = databasePins(lookup);
  const dmsDatabase = dmsDatabaseIn(draft);
  const dmsDatabaseEntry = dmsDatabase && entryOf(draft, dmsDatabase);
  const steps: ProjectConfigStep[] = [];
  if (dmsDatabase && dmsDatabaseEntry && ownDatabase) {
    const importOverrides = missingFrom(
      dmsDatabaseEntry,
      registration(ownDatabase, connections),
    );
    if (importOverrides.length > 0) {
      steps.push({
        op: "ConfigureModule",
        id: dmsDatabase,
        entry: { importOverrides },
      });
    }
  }
  for (const { module, provider } of pins) {
    if (module !== dmsDatabase) {
      steps.push({
        op: "ConfigureModule",
        id: module,
        entry: {
          importOverrides: [
            { interface: DATABASE_INTERFACE, source: provider },
          ],
        },
      });
    }
  }
  return steps;
}

/**
 * Repairs a project whose connections were made before the connect flow registered them with
 * dms-database: each catalog connection this module declares gets what dms-database reads, and
 * each module that imports `interface-database` without a pin is pinned to the own database. Only
 * what is missing is written, so a second run changes nothing and answers an empty success. A dry
 * run answers the changes without writing them.
 */
export function repairDatabaseConnections(
  opts: ProjectConfigOpts = {},
  lookup?: Lookup,
): OpResult<ProjectConfigResult> {
  const configPath = findConfigFile();
  if (!configPath) {
    return unsupported<ProjectConfigResult>(
      "the project has no antelope.config.ts",
    );
  }
  let steps: ProjectConfigStep[];
  try {
    steps = repairSteps(openDraft(configPath), lookup);
  } catch (error) {
    if (error instanceof StepRefusal) {
      return invalidConfig<ProjectConfigResult>(error.message);
    }
    throw error;
  }
  if (steps.length === 0) {
    return { ok: true, data: { files: [] }, changes: [] };
  }
  return configureProject(steps, opts);
}

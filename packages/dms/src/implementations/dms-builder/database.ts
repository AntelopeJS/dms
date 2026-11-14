import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import type {
  AnalysisState,
  CatalogConnectionEntry,
  DatabaseAccess,
  DatabaseCheckInput,
  DatabaseConnection,
  DatabaseProject,
  OpResult,
  ProjectConfigOpts,
  ProjectConfigResult,
  RowSample,
  RowSampleRequest,
} from "@antelopejs/interface-dms-builder";
import { latestAnalysis } from "./engine/analysis-job";
import { catalogOf, listCatalogConnections } from "./engine/catalog-connection";
import {
  checkConnection,
  parseCheckInput,
} from "./engine/database-check-input";
import {
  connectionDetails,
  connectionWiring,
  isConnectionRefusal,
  setConnectionUrl,
} from "./engine/database-connection";
import { removeDatabaseConnection } from "./engine/database-connection-remove";
import { databasePins } from "./engine/database-pin";
import { repairDatabaseConnections } from "./engine/database-repair";
import { dmsDatabaseId } from "./engine/dms-database";
import {
  driverPackages,
  resolvedInterfaceDatabase,
} from "./engine/driver-packages";
import { configuredModuleIds } from "./engine/modules";
import { invalidConfig, notFound } from "./engine/ops";
import { ownModuleId } from "./engine/own-connections";

function succeeded<T>(data: T): OpResult<T> {
  return { ok: true, data, changes: [] };
}

/** Runs a read of the configuration, answering a refusal it throws as `invalid_config`. */
function readingConfig<T>(read: () => OpResult<T>): OpResult<T> {
  try {
    return read();
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return invalidConfig<T>(error.message);
    }
    throw error;
  }
}

async function connectionEntry(id: string): Promise<CatalogConnectionEntry> {
  try {
    const catalog = catalogOf(id);
    if (!catalog) {
      return { id, error: `no provider answers the connection "${id}"` };
    }
    return { id, ...(await catalog.Info()) };
  } catch (error) {
    return {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function ListDatabaseConnections(): Promise<
  CatalogConnectionEntry[]
> {
  const entries: CatalogConnectionEntry[] = [];
  for (const id of listCatalogConnections()) {
    entries.push(await connectionEntry(id));
  }
  return entries;
}

export async function CheckDatabaseConnection(
  input: DatabaseCheckInput,
): Promise<OpResult<DatabaseAccess>> {
  return checkConnection(parseCheckInput(input), (await GetRuntimeInfo()).dev);
}

export async function RepairDatabaseConnections(
  opts?: ProjectConfigOpts,
): Promise<OpResult<ProjectConfigResult>> {
  return repairDatabaseConnections(opts);
}

export async function GetDatabaseProject(): Promise<OpResult<DatabaseProject>> {
  return readingConfig(() => {
    const { ownDatabase, pins } = databasePins();
    const interfaceDatabase = resolvedInterfaceDatabase();
    return succeeded({
      modules: configuredModuleIds(),
      self: ownModuleId(),
      ownDatabase,
      databasePins: pins,
      dmsDatabase: dmsDatabaseId(),
      interfaceDatabase,
      drivers: driverPackages(interfaceDatabase),
    });
  });
}

export async function GetDatabaseConnection(
  connection: string,
): Promise<OpResult<DatabaseConnection>> {
  return readingConfig(() => {
    const wiring = connectionWiring(connection);
    if (!wiring) {
      return notFound<DatabaseConnection>(connection);
    }
    const details = connectionDetails(wiring);
    return succeeded({
      wiring,
      details: details.ok ? details.data : undefined,
    });
  });
}

export async function RemoveDatabaseConnection(
  connection: string,
  opts?: ProjectConfigOpts,
): Promise<OpResult<ProjectConfigResult>> {
  return removeDatabaseConnection(connection, { dryRun: opts?.dryRun });
}

export async function SetDatabaseConnectionUrl(
  connection: string,
  url: string,
): Promise<OpResult<{ variable: string }>> {
  return setConnectionUrl(connection, url);
}

export async function GetLatestAnalysis(
  connection: string,
): Promise<OpResult<AnalysisState>> {
  return latestAnalysis(connection);
}

export async function SampleDatabaseRows(
  connection: string,
  request: RowSampleRequest,
): Promise<OpResult<RowSample>> {
  try {
    const catalog = catalogOf(connection);
    if (!catalog) {
      return notFound<RowSample>(connection);
    }
    return succeeded(
      await catalog.SampleRows({
        relation: request.relation,
        columns: request.columns,
        limit: request.limit,
      }),
    );
  } catch (error) {
    return invalidConfig<RowSample>(
      error instanceof Error ? error.message : String(error),
    );
  }
}

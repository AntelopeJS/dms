import type { InterfaceConnection } from "@antelopejs/interface-core";
import type * as Catalog from "@antelopejs/interface-database-catalog";
import { isCallable, isIndexable } from "./guards";
import { loadModule } from "./module-loader";
import { CATALOG_INTERFACE } from "./interface-ids";
import { ownConnections } from "./own-connections";

function catalogConnections(): InterfaceConnection[] {
  return ownConnections(CATALOG_INTERFACE);
}

/**
 * The catalog functions of one connection, as its provider answers them. The sample limits are
 * the interface's constants, not the provider's.
 */
export type CatalogConnection = Pick<
  typeof Catalog,
  | "Info"
  | "ListRelations"
  | "DescribeRelations"
  | "Profile"
  | "CheckReference"
  | "SampleRows"
>;

type CatalogResolver = (id: string) => CatalogConnection | undefined;
type ConnectionLister = () => string[];

function declaredConnections(): string[] {
  return catalogConnections()
    .map((connection) => connection.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

const CATALOG_FUNCTIONS = [
  "Info",
  "ListRelations",
  "DescribeRelations",
  "Profile",
  "CheckReference",
  "SampleRows",
] satisfies (keyof CatalogConnection)[];

/** Whether a provider's module exports what `@antelopejs/interface-database-catalog` declares. */
function isCatalogConnection(value: unknown): value is CatalogConnection {
  return (
    isIndexable(value) &&
    CATALOG_FUNCTIONS.every((name) => isCallable(value[name]))
  );
}

function declaredCatalog(id: string): CatalogConnection | undefined {
  const connection = catalogConnections().find(
    (candidate) => candidate.id === id,
  );
  if (!connection) {
    return undefined;
  }
  const loaded = loadModule(connection.path);
  if (!isCatalogConnection(loaded)) {
    throw new TypeError(
      `the provider of catalog connection "${id}" does not export the catalog functions`,
    );
  }
  return loaded;
}

function unsupplied(name: string): () => never {
  return () => {
    throw new Error(`the spec supplied no ${name} for this catalog`);
  };
}

/** A catalog of a spec: the functions it supplied, and a refusal for each it did not. */
function specCatalog(supplied: Partial<CatalogConnection>): CatalogConnection {
  return {
    Info: unsupplied("Info"),
    ListRelations: unsupplied("ListRelations"),
    DescribeRelations: unsupplied("DescribeRelations"),
    Profile: unsupplied("Profile"),
    CheckReference: unsupplied("CheckReference"),
    SampleRows: unsupplied("SampleRows"),
    ...supplied,
  };
}

let listConnectionIds: ConnectionLister = declaredConnections;
let resolveCatalog: CatalogResolver = declaredCatalog;

/**
 * The catalog connections the project declares for dms-builder: `importOverrides` entries of
 * `@antelopejs/interface-database-catalog` with an id on the builder's module entry.
 */
export function listCatalogConnections(): string[] {
  return listConnectionIds();
}

/** The catalog of one of the builder's connections; nothing for an unknown one. */
export function catalogOf(id: string): CatalogConnection | undefined {
  return resolveCatalog(id);
}

/** Replaces the declared connections, for specs that run without a provider. */
export function setCatalogConnectionsForTests(
  catalogs?: Record<string, Partial<CatalogConnection>>,
): void {
  listConnectionIds = catalogs
    ? () => Object.keys(catalogs)
    : declaredConnections;
  resolveCatalog = catalogs
    ? (id) =>
        Object.hasOwn(catalogs, id) ? specCatalog(catalogs[id]) : undefined
    : declaredCatalog;
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { Logging } from "@antelopejs/interface-core/logging";
import { z } from "zod";
import { getStoreConfig } from "../config";
import type { StoreCatalogEntry } from "./types";

const BUNDLED_CATALOG_PATH = path.join(
  __dirname,
  "../../data/module-store/catalog.json",
);
const CATALOG_TTL_MS = 60 * 60 * 1000;
const CATALOG_FETCH_TIMEOUT_MS = 10_000;
const SUPPORTED_CATALOG_VERSION = 1;

interface CachedCatalog {
  url: string;
  fetchedAt: number;
  modules: StoreCatalogEntry[];
}

const CatalogEntrySchema = z
  .object({
    id: z.string(),
    package: z.string(),
    icon: z.string(),
    category: z.string(),
  })
  .passthrough();

const CatalogDocumentSchema = z.object({
  version: z.unknown(),
  modules: z.array(z.unknown()).nullish(),
});

type CatalogDocument = z.infer<typeof CatalogDocumentSchema>;

let cachedRemote: CachedCatalog | undefined;
let bundled: StoreCatalogEntry[] | undefined;

/**
 * The entries of a catalog document. A document of another version, or an
 * entry missing a field, is dropped rather than half-read: the store must
 * never install a package the catalog did not name in full.
 */
export function readCatalogDocument(
  catalog: CatalogDocument | null,
): StoreCatalogEntry[] {
  if (catalog?.version !== SUPPORTED_CATALOG_VERSION) {
    throw new Error(
      `Unsupported module catalog version: ${String(catalog?.version)}`,
    );
  }
  return (catalog.modules ?? []).flatMap((entry) => {
    const parsed = CatalogEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function bundledCatalog(): StoreCatalogEntry[] {
  bundled ??= readCatalogDocument(
    CatalogDocumentSchema.parse(
      JSON.parse(readFileSync(BUNDLED_CATALOG_PATH, "utf-8")),
    ),
  );
  return bundled;
}

async function fetchRemoteCatalog(url: string): Promise<StoreCatalogEntry[]> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return readCatalogDocument(
    CatalogDocumentSchema.parse(await response.json()),
  );
}

/**
 * The official modules the store offers: the remote catalog when one is
 * configured and readable, cached for an hour, the bundled one otherwise.
 */
export async function loadStoreCatalog(): Promise<StoreCatalogEntry[]> {
  const url = getStoreConfig().catalogUrl;
  if (!url) {
    return bundledCatalog();
  }
  const isFresh =
    cachedRemote?.url === url &&
    Date.now() - cachedRemote.fetchedAt < CATALOG_TTL_MS;
  if (isFresh && cachedRemote) {
    return cachedRemote.modules;
  }
  try {
    const modules = await fetchRemoteCatalog(url);
    cachedRemote = { url, fetchedAt: Date.now(), modules };
    return modules;
  } catch (error) {
    Logging.Warn(
      `[DMS] Module catalog ${url} could not be read, using the bundled one: ${String(error)}`,
    );
    return cachedRemote?.url === url ? cachedRemote.modules : bundledCatalog();
  }
}

/** The catalog entry of `id`, or undefined when the catalog does not offer it. */
export async function findCatalogEntry(
  id: string,
): Promise<StoreCatalogEntry | undefined> {
  return (await loadStoreCatalog()).find((entry) => entry.id === id);
}

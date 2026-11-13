import { pageRoutePath } from "@antelopejs/interface-dms/page";
import type { BlockNode, ConfigValue } from "@antelopejs/interface-dms-builder";
import { buildPageBlocks } from "./block-tree";
import { isNumber, isString } from "./scalar-guards";
import { isPerTenantSchema } from "./query-emit";
import { routeModelBinding, findQueryRoutes } from "./query-structure";
import { listResourceRecords } from "./resource-index";
import { resourceSchema } from "./resource-schema";
import { listPageRecords } from "./source-index";
import { isPlainObject } from "./value";

/** A page that reads a table, and how many of its blocks and sources do. */
export interface TableReader {
  page: string;
  displayName: string;
  /** The blocks bound to the table, or pointing at its API. */
  blocks: number;
  /** The data sources of the page measuring the table. */
  queries: number;
}

function stringsIn(value: ConfigValue, found: string[] = []): string[] {
  if (isString(value)) {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      stringsIn(entry, found);
    }
  } else if (isPlainObject(value)) {
    for (const entry of Object.values(value)) {
      stringsIn(entry, found);
    }
  }
  return found;
}

function walk(blocks: BlockNode[], visit: (block: BlockNode) => void): void {
  for (const block of blocks) {
    visit(block);
    walk(block.children ?? [], visit);
  }
}

/**
 * Every page reading each table, by the table's ref: what a change to a table
 * reaches, said before it is made — "orders · 3 pages".
 *
 * A page reads a table through a block bound to it, a block pointing at its
 * API (a form submitting to it, a list fetching from it), or a data source
 * measuring it. Pages the scan cannot read are left out rather than guessed.
 */
export function tableReaders(): Record<string, TableReader[]> {
  const resources = listResourceRecords();
  const readers = new Map<string, Map<string, TableReader>>();
  const count = (
    table: string,
    page: { ref: string; displayName: string },
    kind: "blocks" | "queries",
  ): void => {
    const pages = readers.get(table) ?? new Map<string, TableReader>();
    readers.set(table, pages);
    const entry = pages.get(page.ref) ?? {
      page: page.ref,
      displayName: page.displayName,
      blocks: 0,
      queries: 0,
    };
    entry[kind] += 1;
    pages.set(page.ref, entry);
  };
  for (const record of listPageRecords()) {
    let blocks: BlockNode[] = [];
    try {
      blocks = buildPageBlocks(record);
    } catch {
      continue;
    }
    walk(blocks, (block) => {
      if (block.controller) {
        count(block.controller, record, "blocks");
        return;
      }
      const urls = stringsIn(block.config);
      const read = resources.find((resource) =>
        urls.some(
          (url) =>
            url === resource.route || url.startsWith(`${resource.route}/`),
        ),
      );
      if (read) {
        count(read.ref, record, "blocks");
      }
    });
    for (const route of findQueryRoutes(record.classNode)) {
      const binding = routeModelBinding(route.method);
      if (binding) {
        count(binding.resource, record, "queries");
      }
    }
  }
  return Object.fromEntries(
    [...readers].map(([table, pages]) => [table, [...pages.values()]]),
  );
}

/**
 * How many rows each table holds, by its ref, read at the request's tenant for
 * a per-tenant schema. A table the database cannot be asked about — no schema
 * registered, no connection — is left out, never counted as empty. A table
 * that fails to answer is likewise left out: unreadable is not empty.
 */
export async function tableRowCounts(
  tenant: string | undefined,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const record of listResourceRecords()) {
    try {
      const schema = resourceSchema(record);
      if (!schema) {
        continue;
      }
      const instance =
        tenant && isPerTenantSchema(record.schema)
          ? schema.instance(tenant)
          : schema.instance();
      const rows = await instance.table(record.tableName).count();
      if (isNumber(rows)) {
        counts[record.ref] = rows;
      }
    } catch {}
  }
  return counts;
}

/** What deleting a page takes with it, and what it leaves pointing nowhere. */
export interface PageImpact {
  /** How many blocks the page holds. */
  blocks: number;
  /** The data sources the page declares, which go with it. */
  queries: string[];
  /** The pages with a block pointing at its address. */
  linkedFrom: Array<{ page: string; displayName: string }>;
}

function countBlocks(blocks: BlockNode[]): number {
  let count = 0;
  walk(blocks, () => {
    count += 1;
  });
  return count;
}

/**
 * What a page's deletion reaches, said before it is asked: its blocks and data
 * sources go with it, and the links other pages hold to it are left pointing
 * at an address nothing answers. Undefined for a page the scan does not know.
 * A page whose blocks cannot be read is still reported, its block count left
 * at 0. A link counts when it points at the page or at one of its routes, which
 * are served under the DMS's page prefix rather than at the page's own path.
 */
export function pageImpact(ref: string): PageImpact | undefined {
  const pages = listPageRecords();
  const page = pages.find((record) => record.ref === ref);
  if (!page) {
    return undefined;
  }
  let blocks = 0;
  try {
    blocks = countBlocks(buildPageBlocks(page));
  } catch {}
  const queries = findQueryRoutes(page.classNode).map((route) => route.name);
  const points = (url: string): boolean =>
    [ref, pageRoutePath(ref)].some(
      (target) =>
        url === target ||
        [`${target}/`, `${target}?`, `${target}#`].some((start) =>
          url.startsWith(start),
        ),
    );
  const linkedFrom: PageImpact["linkedFrom"] = [];
  for (const other of pages) {
    if (other.ref === ref) {
      continue;
    }
    let found = false;
    try {
      walk(buildPageBlocks(other), (block) => {
        found ||= stringsIn(block.config).some(points);
      });
    } catch {
      continue;
    }
    if (found) {
      linkedFrom.push({ page: other.ref, displayName: other.displayName });
    }
  }
  return { blocks, queries, linkedFrom };
}

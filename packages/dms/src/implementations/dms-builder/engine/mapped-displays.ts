import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import type {
  ColumnDisplay,
  ColumnPresentation,
} from "@antelopejs/interface-dms-builder";
import { badgeTabs } from "@antelopejs/interface-dms/base/internal/column-badges";
import { displayOfDataType } from "./column-display";
import { presentationOf } from "./column-presentation";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";
import { TABLE_BLOCK } from "./map-resources-pages";
import { buildPageStructure } from "./page-structure";
import type { ResourceRecord } from "./resource-index";
import { buildResourceStructure } from "./resource-structure";
import { type PageRecord, joinSlug } from "./scan";
import { findCategoryRecord, findPageRecord } from "./source-index";

const QUOTES = /^["']|["']$/g;

/** A property name as the code holds it, without the quotes a name that is not an identifier needs. */
export function propertyName(name: string): string {
  return name.replace(QUOTES, "");
}

/** The page of a mapped relation's TableView, when the connection's category holds it. */
export function pageOf(
  connection: string,
  record: ResourceRecord,
): PageRecord | undefined {
  const folder = path.dirname(record.databaseFile);
  const name = path
    .relative(path.dirname(path.dirname(folder)), folder)
    .split(path.sep)
    .join("-");
  const category = findCategoryRecord(`pages.${connection}`);
  return category && findPageRecord(joinSlug(category.fullSlug, name));
}

/** What a mapped relation's controller holds for each column: how it is drawn, and its label. */
export interface CurrentColumns {
  displays: Map<string, ColumnDisplay>;
  labels: Map<string, string>;
  /** How the TableView presents each column: its cell display, group, width and help. */
  presentations: Map<string, ColumnPresentation>;
}

/** The display of each column of a mapped relation's controller that has one, and every label. */
export function currentColumns(record: ResourceRecord): CurrentColumns {
  const structure = buildResourceStructure(record.ref);
  const displays = new Map<string, ColumnDisplay>();
  const labels = new Map<string, string>();
  const presentations = new Map<string, ColumnPresentation>();
  for (const field of structure.ok ? structure.data.fields : []) {
    const name = propertyName(field.name);
    presentations.set(name, presentationOf(field));
    if (field.label !== undefined) {
      labels.set(name, field.label);
    }
    const display = displayOfDataType(field.dataType);
    if (display) {
      displays.set(name, display);
    }
  }
  return { displays, labels, presentations };
}

/**
 * The column whose values the tabs of the page's TableView were written from: the badge column its
 * `tabsFrom` reads, or, on a page a mapping wrote before tabs were read from the rows, the badge
 * column its `tabs` list the items of. Tabs edited by hand are not the mapping's, so no column is
 * answered for them.
 */
export function tabsColumnOf(
  page: PageRecord | undefined,
  displays: ReadonlyMap<string, ColumnDisplay>,
): string | undefined {
  const structure = page && buildPageStructure(page.ref);
  const table = structure?.ok
    ? structure.data.blocks.find((block) => block.name === TABLE_BLOCK)
    : undefined;
  const tabsFrom = table?.config?.tabsFrom;
  if (isPlainObject(tabsFrom) && isString(tabsFrom.column)) {
    return displays.get(tabsFrom.column)?.kind === "badge"
      ? tabsFrom.column
      : undefined;
  }
  const stored = table?.config?.tabs;
  return [...displays].find(
    ([column, display]) =>
      display.kind === "badge" &&
      isDeepStrictEqual(stored, badgeTabs(column, display.items)),
  )?.[0];
}

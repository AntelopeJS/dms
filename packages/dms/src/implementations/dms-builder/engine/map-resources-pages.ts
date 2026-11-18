import path from "node:path";
import type {
  BuilderError,
  EditablePageMeta,
  FileChange,
  MapResourcesInput,
  MappedResult,
  OpResult,
  OpWarning,
} from "@antelopejs/interface-dms-builder";
import { getStringProperty } from "./literals";
import type { MappingPlan, PlannedResource } from "./map-resources-plan";
import { buildPageBlocks } from "./block-tree";
import { addBlock, configureBlock } from "./ops";
import { configurePage, createPage } from "./ops-blocks";
import { MAPPED_PAGE_ORDER } from "./planned-page";
import { configureTableView } from "./table-view-settings";
import { createCategory } from "./ops-categories";
import { deletePage } from "./page-delete";
import { joinSlug } from "./scan";
import {
  findCategoryRecord,
  findPageRecord,
  listPageRecords,
} from "./source-index";

/** The name of the TableView block a mapped relation's page holds. */
export const TABLE_BLOCK = "table";

/** A refusal in words, for a warning a person reads. */
export function errorText(error: BuilderError): string {
  switch (error.code) {
    case "invalid_config":
      return error.issues.map((issue) => issue.message).join("; ");
    case "typecheck_failed":
      return `the page would not typecheck (${error.diagnostics.map((item) => item.message).join("; ")})`;
    case "unsupported":
      return error.detail;
    case "not_found":
      return `${error.ref} was not found`;
    case "duplicate_name":
      return `the name ${error.name} is taken in its ${error.scope}`;
    case "stale":
      return `${error.ref} changed on disk since it was read`;
    case "referential_integrity":
      return `still used by ${error.blockedBy.join(", ")}`;
    default:
      return error.code.replace(/_/g, " ");
  }
}

type TableConfig = {
  caption: string;
  labelKey?: string;
  tabsFrom?: { column: string } | undefined;
  tabs?: undefined;
};

/**
 * The table block's caption and, when the relation has them, the label its rows are named by and
 * the column its tabs read from the rows. A relation without tabs leaves the tabs a page holds as
 * they are.
 */
function tableConfig(resource: PlannedResource): TableConfig {
  const config: TableConfig = { caption: resource.displayName };
  if (resource.label) {
    config.labelKey = resource.label;
  }
  if (resource.tabs) {
    config.tabsFrom = { column: resource.tabs.column };
  }
  return config;
}

function pageName(resource: PlannedResource): string {
  return path
    .relative(path.dirname(path.dirname(resource.folder)), resource.folder)
    .split(path.sep)
    .join("-");
}

/** The connection's category in the module, created the first time a TableView needs it. */
function ensureCategory(input: MapResourcesInput): OpResult<string> {
  const ref = `pages.${input.connection}`;
  if (findCategoryRecord(ref)) {
    return { ok: true, data: ref, changes: [] };
  }
  const created = createCategory({
    name: input.connection,
    displayName: input.connection.toUpperCase(),
    module: input.module,
  });
  return created.ok ? { ...created, data: created.data.ref } : created;
}

function addPage(
  input: MapResourcesInput,
  category: string,
  resource: PlannedResource,
): OpResult<string> {
  const page = createPage({
    name: pageName(resource),
    displayName: resource.displayName,
    category,
    module: input.module,
    order: resource.page.order ?? MAPPED_PAGE_ORDER,
    icon: resource.page.icon,
    description: resource.page.description,
  });
  if (!page.ok) {
    return page;
  }
  const config = tableConfig(resource);
  const block = addBlock({
    page: page.data.ref,
    name: TABLE_BLOCK,
    type: "TableView",
    controller: resource.ref,
    config,
  });
  if (!block.ok) {
    return block;
  }
  const options = applyTableOptions(page.data.ref, resource);
  return written(
    page.data.ref,
    [...page.changes, ...block.changes, ...options.changes],
    options.warnings,
  );
}

/** A page written, with the warnings it came with when there are any. */
function written(
  ref: string,
  changes: FileChange[],
  warnings: OpWarning[],
): OpResult<string> {
  const result: OpResult<string> = { ok: true, data: ref, changes };
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  return result;
}

interface OptionsWritten {
  changes: FileChange[];
  warnings: OpWarning[];
}

/** The displays, views and footer the mapping sets on a page; a refusal is a warning, the page keeps what it had. */
function applyTableOptions(
  ref: string,
  resource: PlannedResource,
): OptionsWritten {
  if (!resource.page.tableOptions) {
    return { changes: [], warnings: [] };
  }
  const configured = configureTableView(ref, resource.page.tableOptions);
  if (configured.ok) {
    return {
      changes: configured.changes,
      warnings: configured.warnings ?? [],
    };
  }
  return {
    changes: [],
    warnings: [
      {
        code: "page_not_written",
        message: `${resource.relation}: the table options were not written: ${errorText(configured.error)}`,
      },
    ],
  };
}

interface PagesWritten {
  changes: FileChange[];
  warnings: OpWarning[];
  category?: string;
}

function pageRefOf(category: string, resource: PlannedResource): string {
  const record = findCategoryRecord(category);
  return joinSlug(record?.fullSlug ?? "", pageName(resource));
}

/**
 * The page each mapped table lives on, by the resource its TableView is bound to. A page a person
 * moved into another category is found here, whatever its route has become.
 */
function tablePagesByResource(): Map<string, string> {
  const pages = new Map<string, string>();
  for (const page of listPageRecords()) {
    for (const block of buildPageBlocks(page)) {
      if (
        block.name === TABLE_BLOCK &&
        block.type === "TableView" &&
        block.controller !== undefined &&
        !pages.has(block.controller)
      ) {
        pages.set(block.controller, page.ref);
      }
    }
  }
  return pages;
}

/**
 * The page each relation already has: the one at its default place in the connection's category,
 * else the one its table is bound to anywhere in the menu. Relations without one are absent.
 */
function existingPages(
  category: string,
  resources: PlannedResource[],
): Map<PlannedResource, string> {
  const existing = new Map<PlannedResource, string>();
  let bound: Map<string, string> | undefined;
  for (const resource of resources) {
    const ref = pageRefOf(category, resource);
    if (findPageRecord(ref)) {
      existing.set(resource, ref);
      continue;
    }
    bound ??= tablePagesByResource();
    const moved = bound.get(resource.ref);
    if (moved !== undefined) {
      existing.set(resource, moved);
    }
  }
  return existing;
}

/** The title a page holds as a literal; a title written any other way than the builder's, a constant or a call, reads as none. */
function currentTitle(ref: string): string | undefined {
  const options = findPageRecord(ref)?.optionsNode;
  return options && getStringProperty(options, "displayName");
}

/**
 * What the new choices change in the page's own options. A category sent moves the page. A title
 * changes only when sent, and a title written any other way than the builder's is the page's own
 * and left as it is; an icon and a description change only when sent; the order is sent, else the
 * default of a page that has none.
 */
function pagePatch(
  ref: string,
  resource: PlannedResource,
): Partial<EditablePageMeta> {
  const record = findPageRecord(ref);
  const title = currentTitle(ref);
  const patch: Partial<EditablePageMeta> = {};
  if (
    resource.page.category !== undefined &&
    resource.page.category !== record?.categoryRef
  ) {
    patch.category = resource.page.category;
  }
  if (
    resource.title !== undefined &&
    title !== undefined &&
    title !== resource.title
  ) {
    patch.displayName = resource.title;
  }
  if (resource.page.icon !== undefined && resource.page.icon !== record?.icon) {
    patch.icon = resource.page.icon;
  }
  if (
    resource.page.description !== undefined &&
    resource.page.description !== record?.description
  ) {
    patch.description = resource.page.description;
  }
  const order =
    resource.page.order ??
    (record?.order === undefined ? MAPPED_PAGE_ORDER : undefined);
  if (order !== undefined && order !== record?.order) {
    patch.order = order;
  }
  return patch;
}

/**
 * A remapped TableView keeps its page, wherever the menu has it, with the label the new choices
 * give its table and, when they change it, the category, title, icon, description and order. The
 * caption is the page's title: the one sent, else the one the page holds. Its tabs follow the choices
 * when they set tabs, over the tabs it listed, or turn the ones the mapping wrote off; tabs left
 * out keep the page's.
 */
function updatePage(
  current: string,
  resource: PlannedResource,
): OpResult<string> {
  let ref = current;
  const kept = currentTitle(ref);
  const patch = tableConfig({
    ...resource,
    displayName:
      resource.title ??
      (kept?.trim() ? kept : undefined) ??
      resource.displayName,
  });
  if (resource.tabs || resource.clearTabs) {
    patch.tabs = undefined;
  }
  if (resource.clearTabs) {
    patch.tabsFrom = undefined;
  }
  const configured = configureBlock(`${ref}#${TABLE_BLOCK}`, patch);
  if (!configured.ok) {
    return configured;
  }
  const changes = [...configured.changes];
  const warnings: OpWarning[] = [];
  const meta = pagePatch(ref, resource);
  if (Object.keys(meta).length > 0) {
    const renamed = configurePage(ref, meta);
    if (renamed.ok) {
      ref = renamed.data.ref;
      changes.push(...renamed.changes);
      warnings.push(...(renamed.warnings ?? []));
    } else {
      warnings.push({
        code: "page_not_written",
        message: `${resource.relation}: the page's category, title, icon, description and order stay as they were: ${errorText(renamed.error)}`,
      });
    }
  }
  const options = applyTableOptions(ref, resource);
  changes.push(...options.changes);
  warnings.push(...options.warnings);
  return written(ref, changes, warnings);
}

/** The pages `writePages` removes for this plan: those of relations that lost their TableView. */
export function pagesToRemove(
  input: MapResourcesInput,
  plan: MappingPlan,
): string[] {
  const lost = plan.resources.filter((resource) => !resource.tableView);
  if (lost.length === 0) {
    return [];
  }
  const existing = existingPages(`pages.${input.connection}`, lost);
  return lost.flatMap((resource) => existing.get(resource) ?? []);
}

/** The page a relation's choices call for: created, updated, or removed when it lost its TableView. */
function syncPage(
  input: MapResourcesInput,
  category: string,
  resource: PlannedResource,
  existing: string | undefined,
): OpResult<string | undefined> {
  if (!resource.tableView) {
    if (existing === undefined) {
      return { ok: true, data: undefined, changes: [] };
    }
    const removed = deletePage(existing);
    return removed.ok ? { ...removed, data: undefined } : removed;
  }
  if (existing !== undefined) {
    return updatePage(existing, resource);
  }
  return addPage(input, resource.page.category ?? category, resource);
}

export function writePages(
  input: MapResourcesInput,
  plan: MappingPlan,
  mapped: MappedResult[],
): PagesWritten {
  const written: PagesWritten = { changes: [], warnings: [] };
  const category = `pages.${input.connection}`;
  const existing = existingPages(category, plan.resources);
  const needsCategory = plan.resources.some(
    (resource) =>
      resource.tableView &&
      resource.page.category === undefined &&
      !existing.has(resource),
  );
  if (!needsCategory && !findCategoryRecord(category)) {
    if (!plan.resources.some((resource) => resource.tableView)) {
      return written;
    }
  } else {
    const ensured = ensureCategory(input);
    if (!ensured.ok) {
      written.warnings.push({
        code: "page_not_written",
        message: JSON.stringify(ensured.error),
      });
      return written;
    }
    written.changes.push(...ensured.changes);
    written.category = ensured.data;
  }
  for (const resource of plan.resources) {
    const page = syncPage(input, category, resource, existing.get(resource));
    if (!page.ok) {
      written.warnings.push({
        code: "page_not_written",
        message: `${resource.relation}: ${JSON.stringify(page.error)}`,
      });
      continue;
    }
    written.changes.push(...page.changes);
    written.warnings.push(...(page.warnings ?? []));
    const entry = mapped.find(
      (candidate) => candidate.relation === resource.relation,
    );
    if (entry && page.data) {
      entry.page = page.data;
    }
  }
  return written;
}

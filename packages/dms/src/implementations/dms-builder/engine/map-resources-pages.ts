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
import type { TabConfig } from "./column-display";
import { getStringProperty } from "./literals";
import type { MappingPlan, PlannedResource } from "./map-resources-plan";
import { addBlock, configureBlock } from "./ops";
import { configurePage, createPage } from "./ops-blocks";
import { MAPPED_PAGE_ORDER } from "./planned-page";
import { configureTableView } from "./table-view-settings";
import { createCategory } from "./ops-categories";
import { deletePage } from "./page-delete";
import { joinSlug } from "./scan";
import { findCategoryRecord, findPageRecord } from "./source-index";

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
  tabs?: TabConfig[] | undefined;
};

/**
 * The table block's caption and, when the relation has them, the label its rows are named by and
 * its tabs. A relation without tabs leaves the `tabs` a page holds as they are.
 */
function tableConfig(resource: PlannedResource): TableConfig {
  const config: TableConfig = { caption: resource.displayName };
  if (resource.label) {
    config.labelKey = resource.label;
  }
  if (resource.tabs) {
    config.tabs = resource.tabs;
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
 * What the new choices change in the page's own options. A title written any other way than the
 * builder's, a constant or a call, is the page's own and left as it is; an icon and a description
 * change only when sent; the order is sent, else the default of a page that has none.
 */
function pagePatch(
  ref: string,
  resource: PlannedResource,
): Partial<EditablePageMeta> {
  const record = findPageRecord(ref);
  const options = record?.optionsNode;
  const title = options && getStringProperty(options, "displayName");
  const patch: Partial<EditablePageMeta> = {};
  if (title !== undefined && title !== resource.displayName) {
    patch.displayName = resource.displayName;
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
 * A remapped TableView keeps its page, with the caption and label the new choices give its table
 * and, when they change it, the title, icon, description and order. Its tabs follow the choices
 * when they set tabs, or turn the ones the mapping wrote off; tabs left out keep the page's.
 */
function updatePage(ref: string, resource: PlannedResource): OpResult<string> {
  const patch = tableConfig(resource);
  if (resource.clearTabs) {
    patch.tabs = undefined;
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
      changes.push(...renamed.changes);
    } else {
      warnings.push({
        code: "page_not_written",
        message: `${resource.relation}: the page's title, icon, description and order stay as they were: ${errorText(renamed.error)}`,
      });
    }
  }
  const options = applyTableOptions(ref, resource);
  changes.push(...options.changes);
  warnings.push(...options.warnings);
  return written(ref, changes, warnings);
}

/** The page a relation has though its choices no longer call for one. */
function pageToRemove(
  category: string,
  resource: PlannedResource,
): string | undefined {
  if (resource.tableView) {
    return undefined;
  }
  const ref = pageRefOf(category, resource);
  return findPageRecord(ref) ? ref : undefined;
}

/** The pages `writePages` removes for this plan: those of relations that lost their TableView. */
export function pagesToRemove(
  input: MapResourcesInput,
  plan: MappingPlan,
): string[] {
  const category = `pages.${input.connection}`;
  return plan.resources.flatMap((resource) => {
    const ref = pageToRemove(category, resource);
    return ref === undefined ? [] : [ref];
  });
}

/** The page a relation's choices call for: created, updated, or removed when it lost its TableView. */
function syncPage(
  input: MapResourcesInput,
  category: string,
  resource: PlannedResource,
): OpResult<string | undefined> {
  if (!resource.tableView) {
    const stale = pageToRemove(category, resource);
    if (stale === undefined) {
      return { ok: true, data: undefined, changes: [] };
    }
    const removed = deletePage(stale);
    return removed.ok ? { ...removed, data: undefined } : removed;
  }
  const ref = pageRefOf(category, resource);
  return findPageRecord(ref)
    ? updatePage(ref, resource)
    : addPage(input, category, resource);
}

export function writePages(
  input: MapResourcesInput,
  plan: MappingPlan,
  mapped: MappedResult[],
): PagesWritten {
  const written: PagesWritten = { changes: [], warnings: [] };
  const category = `pages.${input.connection}`;
  const needsCategory = plan.resources.some((resource) => resource.tableView);
  if (!needsCategory && !findCategoryRecord(category)) {
    return written;
  }
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
  for (const resource of plan.resources) {
    const page = syncPage(input, ensured.data, resource);
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

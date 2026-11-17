/** @internal @packageDocumentation */
import {
  type ControllerClass,
  GetControllerInstance,
  type RequestContext,
} from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import type { User } from "../../../auth/db";
import type { ComponentFilterContext } from "../../../component";
import type { FormBuilder, FormPropsSerialized } from "../../form-types";
import { currentLayoutRequest } from "../../../page/internal/layout-request";
import { getRequestTenantId } from "../../../request-tenant";
import { badgeItems, badgeTabs } from "../../internal/column-badges";
import {
  type ColumnReference,
  fillReferencingOptions,
  isReferencingOptions,
  type ReadColumnValues,
  referencedColumns,
  type ReferencingOptions,
} from "../../internal/column-references";
import { isNull, isObject } from "../../../utils/internal/type-check";
import { distinctWithSearch } from "../data-functions";
import type {
  TableViewOptionsSerialized,
  TableViewTabSerialized,
} from "../options";
import { authorizeAction, LIST_ACTION } from "./auth";
import type { ColumnValues } from "./data-functions";

/** The most values a column's tabs show, "All" aside. */
const MAX_TAB_VALUES = 10;
/** How long a read serves the next requests of the same tenant, user and permissions. */
const READ_TTL_MS = 10_000;
/** The most reads a table view keeps. */
const MAX_KEPT_READS = 64;
/** How long a read may take before the page is served without its values. */
const READ_TIMEOUT_MS = 3_000;

interface KeptRead {
  expires: number;
  read: Promise<ReadColumnValues | undefined>;
}

/**
 * Reads, for one request, the values of the columns a table view's options
 * and tabs reference.
 *
 * @internal
 */
export interface TableViewColumnValues {
  controller: ControllerClass;
  /** The columns read, sorted, each once. */
  columns: string[];
  /** The column the tabs are read from. */
  tabsFrom?: ColumnReference;
  /** The reads served lately, by the tenant, user, permissions and columns they were read for. */
  kept: Map<string, KeptRead>;
}

function isTraversable(value: unknown): value is object {
  return isObject(value) && !isNull(value);
}

/** The options of a component that reads column values: a table view's, or a form's it opens as a page. */
type ReadingOptions = TableViewOptionsSerialized | FormPropsSerialized;

/**
 * Every input of the options that reads from a column, each once: those of
 * its columns, its filters and the forms it opens.
 */
function referencingOptionsIn(options: ReadingOptions): ReferencingOptions[] {
  const found: ReferencingOptions[] = [];
  const seen = new Set<object>();
  const pending: object[] = [options];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (seen.has(node)) continue;
    seen.add(node);
    if (isReferencingOptions(node)) found.push(node);
    for (const child of Object.values(node)) {
      if (isTraversable(child)) pending.push(child);
    }
  }
  return found;
}

/**
 * What a table view reads from its rows when it serves a page: the columns
 * its serialized inputs and its `tabsFrom` reference. None when it references
 * no column.
 *
 * @internal
 */
export function tableViewColumnValues(
  controller: ControllerClass,
  serialized: TableViewOptionsSerialized,
  tabsFrom: ColumnReference | undefined,
): TableViewColumnValues | undefined {
  const columns = new Set(
    referencingOptionsIn(serialized).flatMap(referencedColumns),
  );
  if (tabsFrom) columns.add(tabsFrom.column);
  if (columns.size === 0) return undefined;
  return {
    controller,
    columns: [...columns].sort(),
    tabsFrom,
    kept: new Map(),
  };
}

function withoutQuery(ctx: RequestContext): RequestContext {
  const url = new URL(ctx.url);
  url.search = "";
  return { ...ctx, url };
}

function sortedValues(entry: ColumnValues): readonly string[] {
  return [...entry.values].sort((left, right) => left.localeCompare(right));
}

/** The values the rows the caller may list hold, as its list route reads them; it throws without the `list` permission. */
async function readColumns(
  source: TableViewColumnValues,
  ctx: RequestContext,
  user: User,
): Promise<ReadColumnValues> {
  const instance = await GetControllerInstance(source.controller, ctx);
  const permissions = await authorizeAction(
    instance,
    LIST_ACTION,
    user,
    getRequestTenantId(ctx),
  );
  const read = await distinctWithSearch(
    instance,
    ctx,
    source.columns,
    user,
    permissions,
  );
  return new Map(
    read
      .filter((entry) => entry.complete)
      .map((entry) => [entry.column, sortedValues(entry)]),
  );
}

async function withinTimeout<T>(read: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer within ${READ_TIMEOUT_MS} ms`)),
      READ_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([read, expired]);
  } finally {
    clearTimeout(timer);
  }
}

async function readOrNone(
  source: TableViewColumnValues,
  ctx: RequestContext,
  user: User,
): Promise<ReadColumnValues | undefined> {
  try {
    return await withinTimeout(readColumns(source, ctx, user));
  } catch (error) {
    Logging.Debug(
      `[DMS] TableView on "${source.controller.name}" served without the values of ${source.columns.join(", ")}:`,
      error,
    );
    return undefined;
  }
}

function keptRead(
  source: TableViewColumnValues,
  key: string,
  read: () => Promise<ReadColumnValues | undefined>,
): Promise<ReadColumnValues | undefined> {
  const now = Date.now();
  const kept = source.kept.get(key);
  if (kept && kept.expires > now) return kept.read;
  source.kept.delete(key);
  const oldest = source.kept.keys().next();
  if (source.kept.size >= MAX_KEPT_READS && !oldest.done) {
    source.kept.delete(oldest.value);
  }
  const entry = { expires: now + READ_TTL_MS, read: read() };
  source.kept.set(key, entry);
  return entry.read;
}

/** The values of the referenced columns for the page being served; none outside one, or for a caller who is not signed in. */
function readForRequest(
  source: TableViewColumnValues,
  permissions: Set<string>,
  context: ComponentFilterContext,
): Promise<ReadColumnValues | undefined> {
  const request = currentLayoutRequest();
  const { user } = context;
  if (!request || !user) return Promise.resolve(undefined);
  const ctx = withoutQuery(request);
  const key = JSON.stringify([
    getRequestTenantId(ctx),
    user._id,
    [...permissions].sort(),
    source.columns,
  ]);
  return keptRead(source, key, () => readOrNone(source, ctx, user));
}

function tabsOf(
  tabsFrom: ColumnReference | undefined,
  read: ReadColumnValues | undefined,
): TableViewTabSerialized[] | undefined {
  const values = tabsFrom && read?.get(tabsFrom.column);
  return values && values.length > 0 && values.length <= MAX_TAB_VALUES
    ? badgeTabs(tabsFrom.column, badgeItems(values))
    : undefined;
}

/**
 * A copy of `options` with the inputs that read from a column filled from
 * `read`, the options of the registration kept as they are; `options`
 * itself when they hold a value that cannot be copied, such as a function.
 */
function filled<T extends ReadingOptions>(
  source: TableViewColumnValues,
  options: T,
  read: ReadColumnValues | undefined,
): T {
  let served: T;
  try {
    served = structuredClone(options);
  } catch (error) {
    Logging.Debug(
      `[DMS] TableView on "${source.controller.name}" served without the values of ${source.columns.join(", ")}:`,
      error,
    );
    return options;
  }
  for (const referencing of referencingOptionsIn(served)) {
    fillReferencingOptions(referencing, read);
  }
  return served;
}

/**
 * The options served to one request with the values of the columns they
 * reference read from the rows the caller may list. Values that cannot be
 * read leave the inputs plain and the table without tabs.
 *
 * @internal
 */
export async function withColumnValues(
  source: TableViewColumnValues,
  options: TableViewOptionsSerialized,
  permissions: Set<string>,
  context: ComponentFilterContext,
): Promise<TableViewOptionsSerialized> {
  const read = await readForRequest(source, permissions, context);
  const served = filled(source, options, read);
  const tabs = tabsOf(source.tabsFrom, read);
  return tabs ? { ...served, tabs } : served;
}

/**
 * Makes a form the table view opens as a page of its own read the values of
 * the columns its inputs reference, as the table view does.
 *
 * @internal
 */
export function readColumnValuesInForm(
  source: TableViewColumnValues,
  form: FormBuilder,
): void {
  form.onFilter(async (permissions, options, _permissionId, context) =>
    filled(source, options, await readForRequest(source, permissions, context)),
  );
}

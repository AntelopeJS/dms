import {
  type ControllerClass,
  ControllerMeta,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  type DataControllerCallback,
  type DataControllerCallbackWithOptions,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import {
  type Parameters,
  Query,
  Validation,
} from "@antelopejs/interface-data-api/components";
import type { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import type { Stream, ValueProxy } from "@antelopejs/interface-database";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  DEFAULT_ROW_ID_FIELD,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import {
  DEFAULT_EXPORT_FORMAT,
  downloadExportJob,
  type ExportJobAccessOptions,
  type ExportWriter,
  getExporter,
  getExportJobStatus,
  runExportJob,
  evaluateRowActionRule,
} from "../../utils";
import {
  acquireTableViewPresence,
  publishTableViewMutation,
} from "../../realtime/table-view/index";
import {
  applyArchiveFilter,
  buildFilteredQuery,
  countWithSearch as countWithSearchFunc,
  listWithSearch as listWithSearchFunc,
} from "./search-route";
import {
  type RuleRow,
  fetchRowForGuard as fetchRowForGuardHelper,
} from "../../db";

type DataControllerThis =
  | DataControllerCallback
  | DataControllerCallbackWithOptions;

/** Rows read from the database per export page. */
export const EXPORT_BATCH_SIZE = 100;

const TABLE_VIEW_EXPORT_SCOPE = "table-view";

interface TableViewExportContext {
  controllerKey: string;
}

/** One page of rows on its way to the export writer. */
interface ExportBatch {
  controller: DataControllerThis;
  controllerMetadata: DataAPIMeta;
  model: ReturnType<typeof Query.GetModel>;
  pendingRecordBatch: Stream<unknown>;
  writer: ExportWriter;
  headers: string[];
}

async function processBatch({
  controller,
  controllerMetadata,
  model,
  pendingRecordBatch,
  writer,
  headers,
}: ExportBatch): Promise<void> {
  const dbResult = await pendingRecordBatch;
  const results = await Promise.all(
    dbResult.map((entry) =>
      Query.ReadProperties(
        controller,
        controllerMetadata,
        model.constructor.fromDatabase(entry),
      ),
    ),
  );

  Validation.ClearInternal(controllerMetadata, results);

  for (const recordData of results) {
    writer.appendRow(headers, recordData);
  }
}

function getPluckFields(
  controllerMetadata: DataAPIMeta,
  listParams: Parameters.ListParameters,
) {
  const pluckFields: Set<string> | undefined =
    controllerMetadata.pluck[listParams.pluckMode ?? "list"];
  assert(
    listParams.noPluck || pluckFields,
    400,
    `No fields found for pluckMode '${listParams.pluckMode ?? "list"}'`,
  );
  return pluckFields;
}

async function buildIdsExportQuery(
  controller: DataControllerThis,
  controllerMetadata: DataAPIMeta,
  ctx: RequestContext,
  ids: string[],
  user: User | undefined,
) {
  const model = Query.GetModel(controller, controllerMetadata);
  const tableViewMetadata = GetMetadata(
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Callback descriptor types omit the actual receiver constructor; inference yields Function, while TableViewMeta's owner requires a newable target, a preexisting route-binding assumption.
    controller.constructor as ConstructorParameters<typeof TableViewMeta>[0],
    TableViewMeta,
  );
  const idField = tableViewMetadata?.options?.rowIdKey || DEFAULT_ROW_ID_FIELD;
  const archiveField = tableViewMetadata?.archiveField;

  let query = model.table.getAll(ids, idField);

  if (archiveField) {
    const filtersWithArchive = await applyArchiveFilter(
      controller,
      ctx,
      user,
      undefined,
      undefined,
    );
    const archiveConstraint = filtersWithArchive?.[archiveField];
    if (archiveConstraint) {
      const archiveValue = archiveConstraint[0];

      const isNotEqual = archiveConstraint[1] === "ne";
      query = query.filter((row: ValueProxy<RuleRow>) =>
        isNotEqual
          ? row.key(archiveField).ne(archiveValue)
          : row.key(archiveField).eq(archiveValue),
      );
    }
  }

  return { query, queryTotal: query.count(), model, mergedBy: undefined };
}

/** What the export reads from. */
interface ExportQueryInput {
  controller: DataControllerThis;
  controllerMetadata: DataAPIMeta;
  ctx: RequestContext;
  listParams: Parameters.ListParameters;
  ids: string[] | undefined;
  user: User | undefined;
}

async function buildExportQuery({
  controller,
  controllerMetadata,
  ctx,
  listParams,
  ids,
  user,
}: ExportQueryInput) {
  if (ids && ids.length > 0) {
    return buildIdsExportQuery(controller, controllerMetadata, ctx, ids, user);
  }

  const built = await buildFilteredQuery(controller, ctx, listParams, user);
  return {
    query: built.query,
    queryTotal: built.queryTotal,
    model: built.model,
    mergedBy: { filters: built.filters, sortKey: listParams.sortKey },
  };
}

function getControllerKey(controller: DataControllerThis): string {
  const controllerClass =
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Inference yields Function from the callback descriptor receiver; ControllerMeta's constructor owner needs ControllerClass, which the existing data-controller route binding supplies without a runtime check here.
    controller.constructor as ControllerClass;
  return GetMetadata(controllerClass, ControllerMeta).location;
}

function buildTableViewAccessForController(
  controller: DataControllerThis,
): ExportJobAccessOptions<TableViewExportContext> {
  const controllerKey = getControllerKey(controller);
  return {
    scope: TABLE_VIEW_EXPORT_SCOPE,
    isOwnedBy: (_record, context) => context?.controllerKey === controllerKey,
  };
}

/** One export run, end to end. */
export interface ExportRun {
  controller: DataControllerThis;
  ctx: RequestContext;
  listParams: Parameters.ListParameters;
  writer: ExportWriter;
  ids: string[] | undefined;
  user: User;
  reportProgress: (progress: number) => Promise<void>;
}

/**
 * Streams every row matched by an export request into `writer`, one page of
 * {@link EXPORT_BATCH_SIZE} rows at a time.
 */
export async function generateTableViewExport({
  controller,
  ctx,
  listParams,
  writer,
  ids,
  user,
  reportProgress,
}: ExportRun): Promise<void> {
  const controllerMetadata = GetDataControllerMeta(controller);
  const selectedFields = getPluckFields(controllerMetadata, listParams);
  const headers = Array.from(selectedFields ?? []);

  writer.writeHeaders(headers);

  const { query, queryTotal, model, mergedBy } = await buildExportQuery({
    controller,
    controllerMetadata,
    ctx,
    listParams,
    ids,
    user,
  });

  const totalRecordsCount = await queryTotal;

  for (let i = 0; i < totalRecordsCount; i += EXPORT_BATCH_SIZE) {
    const pendingRecordBatch = Query.ListPage(
      model.database,
      controllerMetadata,
      query,
      {
        offset: i,
        limit: EXPORT_BATCH_SIZE,
        filters: mergedBy?.filters,
        sortKey: mergedBy?.sortKey,
        pluck: listParams.noPluck ? undefined : selectedFields,
        noForeign: true,
      },
    );

    await processBatch({
      controller,
      controllerMetadata,
      model,
      pendingRecordBatch,
      writer,
      headers,
    });

    if (totalRecordsCount > 0) {
      const processed = Math.min(i + EXPORT_BATCH_SIZE, totalRecordsCount);
      await reportProgress(Math.floor((processed / totalRecordsCount) * 100));
    }
  }

  writer.close();
}

// oxlint-disable-next-line eslint/max-params -- Export routes bind this positional implementation with controller, request, list options, format, delivery, selected ids and user.
export async function startExport(
  controller: DataControllerThis,
  ctx: RequestContext,
  listParams: Parameters.ListParameters,
  format?: string,
  delivery?: string,
  ids?: string[],
  user?: User,
) {
  if (!user) {
    throw Object.assign(new Error("Authentication required"), { code: 401 });
  }
  const resolvedFormat = format || DEFAULT_EXPORT_FORMAT;
  const exporter = getExporter(resolvedFormat);
  const controllerMetadata = GetDataControllerMeta(controller);
  getPluckFields(controllerMetadata, listParams);

  const controllerKey = getControllerKey(controller);
  const context: TableViewExportContext = { controllerKey };

  const ticket = await runExportJob<TableViewExportContext>({
    ctx,
    user,
    scope: TABLE_VIEW_EXPORT_SCOPE,
    context,
    filename: controllerMetadata.tableName,
    extension: exporter.extension,
    contentType: exporter.contentType,
    delivery,
    generate: async ({ localPath, reportProgress }) => {
      const writer = exporter.createWriter(localPath);
      try {
        await generateTableViewExport({
          controller,
          ctx,
          listParams,
          writer,
          ids,
          user,
          reportProgress,
        });
      } finally {
        writer.close();
      }
    },
  });

  return {
    jobId: ticket.jobId,
    format: resolvedFormat,
    extension: ticket.extension,
  };
}

export async function getExportStatus(
  controller: DataControllerThis,
  ctx: RequestContext,
  exportId: string,
  user?: User,
) {
  if (!user) {
    throw Object.assign(new Error("Authentication required"), { code: 401 });
  }
  return getExportJobStatus(
    ctx,
    user,
    exportId,
    buildTableViewAccessForController(controller),
  );
}

export async function downloadExport(
  controller: DataControllerThis,
  ctx: RequestContext,
  exportId: string,
  user?: User,
) {
  if (!user) {
    throw Object.assign(new Error("Authentication required"), { code: 401 });
  }
  await downloadExportJob(
    ctx,
    user,
    exportId,
    buildTableViewAccessForController(controller),
  );
}

interface RuleValidationResult {
  eligibleIds: string[];
  rejectedIds: string[];
}

export async function fetchRowForGuard(
  controller: any,
  id: string,
  idField: string,
): Promise<RuleRow | undefined> {
  return fetchRowForGuardHelper(controller, id, idField);
}

async function readRuleRow(
  controller: any,
  controllerMetadata: DataAPIMeta,
  model: ReturnType<typeof Query.GetModel>,
  row: RuleRow,
): Promise<RuleRow> {
  try {
    const read = await Query.ReadProperties(
      controller,
      controllerMetadata,
      model.constructor.fromDatabase(row),
    );
    return { ...row, ...read };
  } catch {
    return row;
  }
}

export async function validateRowsAgainstRule(
  controller: any,
  ids: string[],
  rule: RowActionRule | undefined,
  strictMode: boolean,
  idField: string,
): Promise<RuleValidationResult> {
  if (!rule || ids.length === 0) {
    return { eligibleIds: ids, rejectedIds: [] };
  }

  const controllerMetadata = GetDataControllerMeta(controller);
  const model = Query.GetModel(controller, controllerMetadata);

  const rows = await model.table.getAll(ids, idField);

  const eligibleIds: string[] = [];
  const rejectedIds: string[] = [];

  for (const row of rows) {
    const rowData = await readRuleRow(
      controller,
      controllerMetadata,
      model,
      row,
    );
    const rowId = String(rowData[idField]);

    if (evaluateRowActionRule(rule, rowData)) {
      eligibleIds.push(rowId);
    } else {
      rejectedIds.push(rowId);
    }
  }

  if (strictMode && rejectedIds.length > 0) {
    assert(
      false,
      400,
      `Rule validation failed for ${rejectedIds.length} row(s): ${rejectedIds.join(", ")}`,
    );
  }

  return { eligibleIds, rejectedIds };
}

const updatedRowCount = (updated: number, ids: string[]): number =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Database adapters historically report either a numeric count or an adapter result; retain the existing selected-id fallback instead of assuming the declared numeric result at runtime.
  typeof updated === "number" ? updated : ids.length;

export async function archiveRows(
  controller: any,
  _ctx: RequestContext,
  ids: string | string[],
) {
  const controllerMetadata = GetDataControllerMeta(controller);
  const tableViewMetadata = GetMetadata(controller.constructor, TableViewMeta);
  const idField = tableViewMetadata.options.rowIdKey || DEFAULT_ROW_ID_FIELD;
  const archiveField = tableViewMetadata.archiveField;
  const model = Query.GetModel(controller, controllerMetadata);
  const idArray = Array.isArray(ids) ? ids : [ids];

  if (!archiveField) {
    throw new Error(
      "Archive field not configured. Use @ArchiveField decorator on the data controller.",
    );
  }

  if (idArray.length === 0) {
    return { success: true, archivedCount: 0 };
  }

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Inference gives a boolean archive patch, but data-api's erased model makes DeepPartial<any> reject booleans; Parameters of the overloaded update exposes its callback overload instead, so retain the existing unchecked adapter call.
  const updated = await model.table.getAll(idArray, idField).update({
    [archiveField]: true,
  } as any);

  return { success: true, archivedCount: updatedRowCount(updated, idArray) };
}

export async function restoreRows(
  controller: any,
  _ctx: RequestContext,
  ids: string | string[],
) {
  const controllerMetadata = GetDataControllerMeta(controller);
  const tableViewMetadata = GetMetadata(controller.constructor, TableViewMeta);
  const idField = tableViewMetadata.options.rowIdKey || DEFAULT_ROW_ID_FIELD;
  const archiveField = tableViewMetadata.archiveField;
  const model = Query.GetModel(controller, controllerMetadata);
  const idArray = Array.isArray(ids) ? ids : [ids];

  if (!archiveField) {
    throw new Error(
      "Archive field not configured. Use @ArchiveField decorator on the data controller.",
    );
  }

  if (idArray.length === 0) {
    return { success: true, restoredCount: 0 };
  }

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The inferred boolean restore patch fails the erased model's DeepPartial<any>; owner-derived Parameters selects the callback overload, not the document overload, so preserving this adapter call still needs its legacy assertion.
  const updated = await model.table.getAll(idArray, idField).update({
    [archiveField]: false,
  } as any);

  return { success: true, restoredCount: updatedRowCount(updated, idArray) };
}

export const listWithSearch = listWithSearchFunc;

export const countWithSearch = countWithSearchFunc;

export { summarizeWithSearch } from "./footer-summary";

export { resolveBulkRowIds } from "./bulk-selection";

export namespace internal {
  export const PublishMutation = publishTableViewMutation;
  export const AcquirePresence = acquireTableViewPresence;
}

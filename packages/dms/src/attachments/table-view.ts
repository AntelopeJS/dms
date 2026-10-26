import { GetDataControllerMeta } from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import {
  fromPlainData,
  LocalizationModifier,
  unlock,
} from "@antelopejs/interface-database-decorators";
import { fetchRowForGuard } from "../implementations/dms-base/table-view";
import type {
  AttachmentField,
  internal,
} from "@antelopejs/interface-dms/attachments";
import type { TableViewAttachmentSaveRequest } from "@antelopejs/interface-dms/internal/attachments";
import { parseGuardBody } from "@antelopejs/interface-dms/base/table-view/internal/guards";
import {
  getControllerLocation,
  getTableViewMetaFor,
} from "@antelopejs/interface-dms/base/table-view/internal/meta";
import { tableAttachmentFields } from "./bindings";
import { collectAttachments } from "./fields";
import { denyAttachment } from "./registry";
import { SaveComponentFiles } from "./save";

async function loadDocument(
  controller: TableViewAttachmentSaveRequest["controller"],
  fields: AttachmentField[],
  id: string,
) {
  const meta = GetDataControllerMeta(controller);
  const idField = getTableViewMetaFor(controller).options.rowIdKey || "_id";
  const row = await fetchRowForGuard(
    controller,
    id,
    meta.fields[idField]?.dbName || idField,
  );
  if (!row) return undefined;
  const stored = fromPlainData(row, meta.tableClass);
  unlock(stored, LocalizationModifier, undefined, "*");
  return Object.fromEntries(
    [idField, ...fields.map((field) => field.key)].map((key) => [
      key,
      stored[meta.fields[key]?.dbName || key],
    ]),
  );
}

function retainedFiles(
  fields: AttachmentField[],
  before: Parameters<typeof collectAttachments>[1],
) {
  return Object.fromEntries(
    fields
      .filter((field) => collectAttachments([field], before).length > 0)
      .map((field) => [field.key, before[field.key]]),
  );
}

/** Keeps the database/registry implementation out of host modules' interfaces. */
export async function SaveTableViewAttachments(
  request: TableViewAttachmentSaveRequest,
): Promise<Awaited<ReturnType<typeof internal.SaveTableViewAttachments>>> {
  const { controller, route, context, params, args, mode, componentIds } =
    request;
  const fields = tableAttachmentFields(
    getTableViewMetaFor(controller),
    getControllerLocation(controller),
  );
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Route params are erased by the wrapper contract; preserve the existing optional edit-id probe before dispatch.
  const documentId = (params as Partial<Parameters.EditParameters>)?.id;
  if (mode === "delete") {
    return deleteDocuments({ ...request, fields });
  }
  const before = documentId
    ? (await loadDocument(controller, fields, documentId)) || {}
    : {};
  return SaveComponentFiles(
    {
      context,
      componentIds,
      fields,
      before,
      submitted: {
        ...retainedFiles(fields, before),
        ...parseGuardBody(args[0]),
      },
    },
    async (promoted) => {
      const result = await route.func.call(
        controller,
        context,
        params,
        promoted,
        ...args.slice(1),
      );

      const id = documentId || result?._id;
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only a nonempty string id may be used to reload the saved document.
      if (typeof id !== "string" || !id) denyAttachment();
      const document = await loadDocument(controller, fields, id);
      if (!document) denyAttachment();
      return { id, document, result };
    },
  );
}

interface DeleteDocumentsRequest extends TableViewAttachmentSaveRequest {
  fields: AttachmentField[];
}

async function deleteDocuments(request: DeleteDocumentsRequest) {
  const { controller, route, context, params, args, fields, componentIds } =
    request;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Delete mode selects delete-route params, but the wrapper's external contract erases that correlation.
  const ids = (params as Parameters.DeleteParameters).id;
  const rows = await Promise.all(
    (Array.isArray(ids) ? ids : [ids]).map((id) =>
      loadDocument(controller, fields, String(id)),
    ),
  );
  const before = Object.fromEntries(
    fields.map((field) => [field.key, rows.map((row) => row?.[field.key])]),
  );
  return SaveComponentFiles(
    { context, componentIds, fields, before, submitted: {} },
    async () => ({
      result: await route.func.call(controller, context, params, ...args),
      document: {},
    }),
  );
}

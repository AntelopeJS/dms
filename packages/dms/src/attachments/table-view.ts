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
  TableViewAttachmentSaveRequest,
} from "@antelopejs/interface-dms/attachments";
import { parseGuardBody } from "@antelopejs/interface-dms/base/table-view/guards";
import {
  getControllerLocation,
  getTableViewMetaFor,
} from "@antelopejs/interface-dms/base/table-view/meta";
import { tableAttachmentFields } from "./bindings";
import { collectAttachments } from "./fields";
import { denyAttachment } from "./registry";
import { SaveComponentFiles } from "./save";

async function loadDocument(
  controller: unknown,
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
  before: Record<string, unknown>,
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
): Promise<unknown> {
  const { controller, route, context, params, args, mode, componentIds } =
    request;
  const fields = tableAttachmentFields(
    getTableViewMetaFor(controller),
    getControllerLocation(controller),
  );
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
        JSON.stringify(promoted),
        ...args.slice(1),
      );
      const id = documentId || (Array.isArray(result) ? result[0] : undefined);
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

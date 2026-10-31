import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { getDataTypeId } from "../../data-types/core";
import { Form } from "../../form-schema";
import type { FormBuilder, FormProps } from "../../form-types";
import {
  type ResourceFormMode,
  type ResourceFormOptions,
  ROUTE_PARAM_ROW_ID,
} from "../../resource-form-schema";
import { HttpMethod } from "../../types";
import { TableViewMeta } from "../meta";
import {
  REALTIME_PRESENCE_ACQUIRE_VALUE,
  REALTIME_PRESENCE_QUERY,
} from "./realtime";

type FormRoutes = Pick<
  FormProps,
  "fetchUrl" | "fetchUrlMethod" | "submitUrl" | "submitUrlMethod" | "kind"
>;

function formRoutes(
  location: string,
  mode: ResourceFormMode,
  rowId: string,
): FormRoutes {
  switch (mode) {
    case "new":
      return {
        fetchUrl: `${location}/get?id={{query.duplicate}}`,
        fetchUrlMethod: HttpMethod.get,
        submitUrl: `${location}/new`,
        submitUrlMethod: HttpMethod.post,
        kind: "create",
      };
    case "edit":
      return {
        fetchUrl: `${location}/get?id=${rowId}&${REALTIME_PRESENCE_QUERY}=${REALTIME_PRESENCE_ACQUIRE_VALUE}`,
        fetchUrlMethod: HttpMethod.get,
        submitUrl: `${location}/edit?id=${rowId}`,
        submitUrlMethod: HttpMethod.put,
      };
    case "view":
      return {
        fetchUrl: `${location}/get?id=${rowId}`,
        fetchUrlMethod: HttpMethod.get,
      };
  }
}

/**
 * Point every file and image column at the attachment it stores into. The
 * upload a form field hands out is claimed against that address, so a form
 * built before it is set cannot upload anything. Idempotent: whichever form or
 * table over the controller comes first sets the same value.
 *
 * @internal
 */
export function stampAttachmentFields(
  meta: TableViewMeta,
  location: string,
): void {
  for (const [columnKey, column] of Object.entries(meta.columns)) {
    const typeId = getDataTypeId(column.type);
    if (typeId === "file" || typeId === "image") {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type -- Registry ids select attachment types without narrowing DataType.options; this unchecked write preserves the published stamping behavior for module registrations.
      const typeOptions = column.type.options as Record<string, unknown>;
      typeOptions.attachmentField = `${location}#${columnKey}`;
    }
  }
}

/**
 * The form over `controller` in `mode`: the fields its columns declare for
 * that mode, loaded from and submitted to the routes the mode uses. `rowId`
 * defaults to {@link ROUTE_PARAM_ROW_ID}, the segment a TableView's own form
 * pages carry.
 *
 * `undefined` when no column has an input in that mode — a resource whose
 * every field is read-only has no edit form to offer.
 *
 * @internal
 */
export function resourceForm(
  controller: ControllerClass,
  mode: ResourceFormMode,
  options: ResourceFormOptions = {},
): FormBuilder | undefined {
  const meta = GetMetadata(controller, TableViewMeta);
  const { location } = meta.config;
  stampAttachmentFields(meta, location);
  const fields = meta.getFormFields(mode);
  if (fields.length === 0) {
    return undefined;
  }
  const { rowId = ROUTE_PARAM_ROW_ID, ...formOptions } = options;
  const form = Form({
    ...formOptions,
    fields,
    ...formRoutes(location, mode, rowId),
  });
  if (mode !== "view") meta.addResourceFormBuilder(form);
  return form;
}

// The form over a resource: its fields and the routes it loads and submits
// through, derived from the DataController for a mode. The forms a TableView
// opens and the ones a ResourceForm block renders are built here and nowhere
// else, so the shape of a route changes in one place for both.

import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { getDataTypeId } from "../data-types/core";
import { Form } from "../form-schema";
import type { FormBuilder, FormProps } from "../form-types";
import {
  QUERY_ROW_ID,
  type ResourceFormBlockOptions,
  type ResourceFormMode,
  type ResourceFormOptions,
} from "../resource-form-schema";
import { HttpMethod } from "../types";
import { TableViewMeta } from "./meta";
import {
  REALTIME_PRESENCE_ACQUIRE_VALUE,
  REALTIME_PRESENCE_QUERY,
} from "./realtime";

/** The row a page served under a `:id` route segment is about. */
export const ROUTE_PARAM_ROW_ID = "{{params.id}}";

type FormRoutes = Pick<
  FormProps,
  "fetchUrl" | "fetchUrlMethod" | "submitUrl" | "submitUrlMethod"
>;

function formRoutes(
  location: string,
  mode: ResourceFormMode,
  rowId: string,
): FormRoutes {
  switch (mode) {
    case "new":
      return {
        // A row being duplicated seeds the new one; without the query the
        // token stays unresolved and nothing is fetched.
        fetchUrl: `${location}/get?id={{query.duplicate}}`,
        fetchUrlMethod: HttpMethod.get,
        submitUrl: `${location}/new`,
        submitUrlMethod: HttpMethod.post,
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
 */
export function stampAttachmentFields(
  meta: TableViewMeta,
  location: string,
): void {
  for (const [columnKey, column] of Object.entries(meta.columns)) {
    const typeId = getDataTypeId(column.type);
    if (typeId === "file" || typeId === "image") {
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
 */
export function resourceForm<T extends ControllerClass>(
  controller: T,
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
  return Form({
    ...formOptions,
    fields,
    ...formRoutes(location, mode, rowId),
  });
}

/**
 * A form over one table, for a page: pick the table and the mode, and its
 * fields, routes and methods follow — the same form a TableView opens for that
 * mode. `Form` stays the way to reach an endpoint of one's own.
 *
 * The row `edit` and `view` open is read from the page's query string by
 * default ({@link QUERY_ROW_ID}): a page the builder writes has no `:id`
 * segment to read it from.
 */
export function ResourceForm<T extends ControllerClass>(
  controller: T,
  options: ResourceFormBlockOptions,
): FormBuilder {
  const { mode, rowId = QUERY_ROW_ID, ...formOptions } = options;
  // A resource with nothing to fill in for this mode still renders as a form —
  // its title, and no field — rather than as a hole in the page.
  return (
    resourceForm(controller, mode, { ...formOptions, rowId }) ??
    Form({ ...formOptions, fields: [] })
  );
}

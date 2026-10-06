import type { ControllerClass } from "@antelopejs/interface-api";
import { Form } from "../form-schema";
import type { FormBuilder } from "../form-types";
import {
  QUERY_ROW_ID,
  type ResourceFormBlockOptions,
} from "../resource-form-schema";
import { resourceForm } from "./internal/resource-form";

export { ROUTE_PARAM_ROW_ID } from "../resource-form-schema";

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
  const form = resourceForm(controller, mode, { ...formOptions, rowId });
  // A resource with nothing to fill in for this mode still renders as a form —
  // its title, and no field — rather than as a hole in the page.
  return form ?? Form({ ...formOptions, fields: [] });
}

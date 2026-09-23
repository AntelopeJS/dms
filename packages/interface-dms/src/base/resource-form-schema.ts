// The options of the `ResourceForm` block, declared without loading the table
// view runtime, so builder tooling reads the block from the catalog alone. The
// factory lives with the forms it shares with `TableView`, in
// `table-view/resource-form`.

import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { FORM_COMPONENT_NAME } from "./form-block-schema";
import type { FormProps } from "./form-types";

/** Which of a resource's forms: creating a row, editing one, or reading one. */
export const RESOURCE_FORM_MODES = ["new", "edit", "view"] as const;
export type ResourceFormMode = (typeof RESOURCE_FORM_MODES)[number];

/**
 * The row a page reached as `…?id=<row>` is about. A page the builder writes
 * has no route segment of its own to carry an id, so the query string does.
 */
export const QUERY_ROW_ID = "{{query.id}}";

/** What a form over a resource leaves open: everything but its fields and routes. */
export interface ResourceFormOptions extends Omit<
  FormProps,
  "fields" | "fetchUrl" | "fetchUrlMethod" | "submitUrl" | "submitUrlMethod"
> {
  /**
   * Where `edit` and `view` read the id of their row, as a token the form
   * resolves against its page's URL.
   */
  rowId?: string;
}

/** The options `ResourceForm` accepts, after its controller argument. */
export interface ResourceFormBlockOptions extends ResourceFormOptions {
  mode: ResourceFormMode;
}

/**
 * The options `ResourceForm` accepts. Deliberately few: which fields it shows,
 * and where it loads and submits them, come from the resource and the mode —
 * a field is configured on the resource, not on each form that shows it.
 */
export const ResourceFormSchema = z.object({
  mode: ui(
    z
      .enum(RESOURCE_FORM_MODES)
      .describe("Create a row, edit one, or show one read-only."),
    { label: "Mode", order: 1, group: "content" },
  ),
  title: ui(z.string().optional(), {
    label: "Title",
    order: 2,
    group: "content",
  }),
  description: ui(z.string().optional(), {
    label: "Description",
    order: 3,
    group: "content",
    widget: "textarea",
  }),
  submitLabel: ui(z.string().optional(), {
    label: "Submit button label",
    order: 4,
    group: "content",
  }),
  successMessage: ui(z.string().optional(), {
    label: "Success message",
    group: "content",
  }),
  errorMessage: ui(z.string().optional(), {
    label: "Error message",
    group: "content",
  }),
  fieldsOrientation: ui(z.enum(["horizontal", "vertical"]).optional(), {
    label: "Field orientation",
    group: "layout",
    widget: "segmented",
  }),
  redirectOnSuccess: ui(
    z
      .string()
      .optional()
      .describe(
        "Path to open once saved; {{response._id}} is the row just written.",
      ),
    { label: "Then open", group: "behavior" },
  ),
  rowId: ui(
    z
      .string()
      .optional()
      .describe(
        `Where edit and view read the row id from. Defaults to ${QUERY_ROW_ID}.`,
      ),
    { label: "Row id from", group: "advanced", placeholder: QUERY_ROW_ID },
  ),
  submitDefaults: ui(z.record(z.unknown()).optional(), {
    label: "Payload defaults",
    group: "advanced",
    widget: "json",
  }),
}) satisfies BlockOptionsFor<ResourceFormBlockOptions>;

RegisterBlockType({
  type: "ResourceForm",
  componentName: FORM_COMPONENT_NAME,
  schema: ResourceFormSchema,
  controllerArg: true,
  meta: {
    name: "Table form",
    icon: "i-ph-note-pencil",
    description:
      "Form over a table: creates, edits or shows one of its rows, with the fields the table declares.",
    group: "data",
  },
});

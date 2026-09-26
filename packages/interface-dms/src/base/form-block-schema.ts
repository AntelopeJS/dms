import type { ComponentInfoSerialized } from "../component";
import { z } from "zod";
import {
  type BlockOptionsFor,
  opaqueOption,
  RegisterBlockType,
  requiredOpaqueOption,
  ui,
} from "./block-registry";
import type { DataType } from "./data-types/core";
import type { FieldGroup, FormField, FormProps } from "./form-types";
import type { DefaultValue } from "./types";
import { HttpMethod } from "./types/http";

/** The frontend component `Form` emits. */
export const FORM_COMPONENT_NAME = "dms-form";

const FIELD_ORIENTATIONS = ["horizontal", "vertical"] as const;

// Named for the config panel, which offers a form's entries as one or the
// other of these: two branches both called after their kind read as one.
const FormFieldSchema = ui(
  z.object({
    id: ui(z.string().describe("Field key in the submitted payload."), {
      label: "Key",
      derivedFrom: "label",
    }),
    label: ui(z.string().optional(), { label: "Label" }),
    description: ui(z.string().optional(), {
      label: "Help text",
      widget: "textarea",
    }),
    type: ui(
      requiredOpaqueOption<DataType>().describe("The field's data type."),
      {
        label: "Type",
        widget: "dataType",
      },
    ),
    inputComponent: ui(opaqueOption<ComponentInfoSerialized>().optional(), {
      hidden: true,
    }),
    disabled: ui(z.boolean().optional(), {
      label: "Disabled",
      widget: "switch",
    }),
    required: ui(z.boolean().optional(), {
      label: "Required",
      widget: "switch",
    }),
    defaultValue: ui(opaqueOption<DefaultValue>().optional(), {
      label: "Default value",
      widget: "json",
      typedBy: "type",
    }),
    localized: ui(z.boolean().optional(), {
      label: "Translatable",
      widget: "switch",
    }),
  }) satisfies BlockOptionsFor<FormField>,
  { label: "Field" },
);

const FieldGroupSchema = ui(
  z.object({
    id: ui(z.string().describe("Key the group is known by."), {
      label: "Key",
      derivedFrom: "label",
    }),
    label: ui(z.string().optional(), { label: "Title" }),
    description: ui(z.string().optional(), {
      label: "Help text",
      widget: "textarea",
    }),
    fields: ui(z.array(FormFieldSchema), { label: "Fields" }),
    orientation: ui(z.enum(FIELD_ORIENTATIONS).optional(), {
      label: "Field orientation",
      widget: "segmented",
    }),
    order: ui(z.number().optional(), { label: "Order" }),
  }) satisfies BlockOptionsFor<FieldGroup>,
  { label: "Group" },
);

const SUBMIT_MESSAGES = "Custom submit messages";

/**
 * The two messages a form shows once it is submitted.
 *
 * Left out, the form says its own, in the reader's language — or, on a failure,
 * whatever the server answered. They sit behind one switch, and what they
 * suggest is those same words in English, for an author to start from.
 */
export const SubmitMessageOptions = {
  successMessage: ui(z.string().optional(), {
    label: "Success message",
    group: "content",
    placeholder: "Data has been successfully saved",
    optIn: SUBMIT_MESSAGES,
  }),
  errorMessage: ui(z.string().optional(), {
    label: "Error message",
    group: "content",
    placeholder: "An unknown error occurred",
    optIn: SUBMIT_MESSAGES,
  }),
};

/** The options `Form` accepts, without loading its runtime or models. */
export const FormSchema = z.object({
  title: ui(z.string().optional(), { label: "Title", group: "content" }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  fields: ui(
    z
      // Group first: a field's opaque type would otherwise match a group and strip its fields.
      .array(z.union([FieldGroupSchema, FormFieldSchema]))
      .describe("The fields and field groups the form renders."),
    { label: "Fields", group: "content" },
  ),
  // Addresses and methods: written by the builder from the table an author
  // picks in its simple view, and typed in its advanced one.
  fetchUrl: ui(
    z.string().optional().describe("Endpoint the initial values come from."),
    {
      label: "Load from",
      group: "data",
      widget: "url",
      advanced: true,
    },
  ),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "Load method",
    group: "data",
    widget: "select",
    advanced: true,
  }),
  submitUrl: ui(z.string().optional(), {
    label: "Submit to",
    group: "data",
    widget: "url",
    advanced: true,
  }),
  submitUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "Submit method",
    group: "data",
    widget: "select",
    advanced: true,
  }),
  ...SubmitMessageOptions,
  submitLabel: ui(z.string().optional(), {
    label: "Submit button label",
    group: "content",
  }),
  showActions: ui(
    z
      .boolean()
      .optional()
      .describe(
        "Show the reset and submit buttons, before the form has somewhere to submit to too.",
      ),
    {
      label: "Show the buttons",
      group: "appearance",
      widget: "switch",
      initial: true,
      advanced: true,
    },
  ),
  fieldsOrientation: ui(z.enum(FIELD_ORIENTATIONS).optional(), {
    label: "Field orientation",
    group: "layout",
    widget: "segmented",
  }),
  redirectOnSuccess: ui(
    z.string().optional().describe("Path to navigate to after a submit."),
    {
      label: "Redirect on success",
      group: "behavior",
    },
  ),
  submitDefaults: ui(z.record(z.unknown()).optional(), {
    label: "Payload defaults",
    group: "advanced",
    widget: "json",
  }),
  slotId: ui(
    z.string().optional().describe("Lets another module contribute fields."),
    {
      label: "Slot id",
      group: "advanced",
    },
  ),
}) satisfies BlockOptionsFor<FormProps>;

RegisterBlockType({
  type: "Form",
  componentName: FORM_COMPONENT_NAME,
  schema: FormSchema,
  meta: {
    name: "Form",
    icon: "i-ph-note-pencil",
    description: "Field-by-field form that loads and submits its own values.",
    group: "data",
  },
});

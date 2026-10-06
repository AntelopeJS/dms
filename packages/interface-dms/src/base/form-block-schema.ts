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
import {
  FORM_KINDS,
  FORM_SAVE_MODES,
  FORM_SECTION_NAVS,
  type FieldGroup,
  type FormField,
  type FormProps,
  type FormSection,
} from "./form-types";
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
    hint: ui(z.string().optional(), {
      label: "Hint under the control",
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
    readonly: ui(opaqueOption<FormField["readonly"]>().optional(), {
      label: "Read-only",
      widget: "json",
      advanced: true,
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

// Group first: a field's opaque type would otherwise match a group and strip its fields.
const FormEntriesSchema = z.array(z.union([FieldGroupSchema, FormFieldSchema]));

const FormSectionSchema = ui(
  z.object({
    id: ui(z.string().describe("Anchor of the section."), {
      label: "Key",
      derivedFrom: "label",
    }),
    label: ui(z.string(), { label: "Title" }),
    description: ui(z.string().optional(), {
      label: "Help text",
      widget: "textarea",
    }),
    icon: ui(z.string().optional(), { label: "Icon", widget: "icon" }),
    fields: ui(FormEntriesSchema, { label: "Fields" }),
  }) satisfies BlockOptionsFor<FormSection>,
  { label: "Section" },
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
    FormEntriesSchema.optional().describe(
      "The fields and field groups the form renders.",
    ),
    { label: "Fields", group: "content" },
  ),
  sections: ui(
    z
      .array(FormSectionSchema)
      .optional()
      .describe("The form's fields split into titled cards."),
    { label: "Sections", group: "content" },
  ),
  sectionNav: ui(
    z
      .enum(FORM_SECTION_NAVS)
      .optional()
      .describe(
        "How a sectioned form lists its sections: beside them, as chips above them, or not at all.",
      ),
    {
      label: "Section navigation",
      group: "layout",
      widget: "segmented",
      valueLabels: { side: "Side", jump: "Chips", none: "None" },
    },
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
  saveMode: ui(
    z
      .enum(FORM_SAVE_MODES)
      .optional()
      .describe(
        "How the form offers to save: a sticky bar while there are changes, footer buttons, none, or each change on its own.",
      ),
    {
      label: "Save buttons",
      group: "appearance",
      widget: "select",
      valueLabels: {
        bar: "Save bar",
        footer: "Footer buttons",
        none: "None",
        instant: "Instant",
      },
    },
  ),
  kind: ui(
    z
      .enum(FORM_KINDS)
      .optional()
      .describe(
        "A record keeps its values once saved; an action (send, invite, run) empties after a submit.",
      ),
    {
      label: "Form kind",
      group: "behavior",
      widget: "segmented",
      valueLabels: { record: "Record", action: "Action" },
    },
  ),
  backTo: ui(
    z.string().optional().describe("Where Cancel leads a record form."),
    {
      label: "Cancel leads to",
      group: "behavior",
      widget: "url",
      advanced: true,
    },
  ),
  labelKey: ui(
    z
      .string()
      .optional()
      .describe("Field of the loaded record that ends the page's breadcrumb."),
    { label: "Record label field", group: "data", advanced: true },
  ),
  // Deprecated aliases of `saveMode` and `kind`: read, no longer offered.
  showActions: ui(z.boolean().optional(), {
    label: "Show the buttons",
    hidden: true,
  }),
  saveBar: ui(z.boolean().optional(), {
    label: "Sticky save bar",
    hidden: true,
  }),
  cancellable: ui(z.boolean().optional(), {
    label: "Cancellable",
    hidden: true,
  }),
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

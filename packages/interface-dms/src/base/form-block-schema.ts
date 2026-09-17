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

const FormFieldSchema = z.object({
  id: ui(z.string().describe("Field key in the submitted payload."), {
    label: "Key",
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
  disabled: ui(z.boolean().optional(), { label: "Disabled", widget: "switch" }),
  required: ui(z.boolean().optional(), { label: "Required", widget: "switch" }),
  defaultValue: ui(opaqueOption<DefaultValue>().optional(), {
    label: "Default value",
    widget: "json",
  }),
  localized: ui(z.boolean().optional(), {
    label: "Translatable",
    widget: "switch",
  }),
}) satisfies BlockOptionsFor<FormField>;

const FieldGroupSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema),
  orientation: z.enum(FIELD_ORIENTATIONS).optional(),
  order: z.number().optional(),
}) satisfies BlockOptionsFor<FieldGroup>;

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
  fetchUrl: ui(
    z.string().optional().describe("Endpoint the initial values come from."),
    {
      label: "Load from",
      group: "data",
      widget: "url",
    },
  ),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "Load method",
    group: "data",
    widget: "select",
  }),
  submitUrl: ui(z.string().optional(), {
    label: "Submit to",
    group: "data",
    widget: "url",
  }),
  submitUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "Submit method",
    group: "data",
    widget: "select",
  }),
  successMessage: ui(z.string().optional(), {
    label: "Success message",
    group: "content",
  }),
  errorMessage: ui(z.string().optional(), {
    label: "Error message",
    group: "content",
  }),
  submitLabel: ui(z.string().optional(), {
    label: "Submit button label",
    group: "content",
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

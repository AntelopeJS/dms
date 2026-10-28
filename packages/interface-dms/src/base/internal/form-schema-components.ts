/** @internal */
import { ComponentBuilder } from "../../component";
import { StampUploadFieldTokens } from "../../uploads";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { buildFormSchema } from "../form-schema";
import type {
  FormFieldOrGroup,
  FormFieldOrGroupSerialized,
  FormProps,
  FormPropsSerialized,
  FormSection,
  FormSectionSerialized,
} from "../form-types";
import { isFieldGroup } from "../form-types";
import { FORM_COMPONENT_NAME } from "./form-block-schema";
import { serializeFormField } from "./form-schema";

/** @internal */
export function serializeFormEntry(
  item: FormFieldOrGroup,
): FormFieldOrGroupSerialized {
  if (isFieldGroup(item)) {
    return {
      id: item.id,
      label: item.label,
      description: item.description,
      fields: item.fields.map(serializeFormField),
      orientation: item.orientation,
      order: item.order,
    };
  }
  return serializeFormField(item);
}

function withoutSections(
  options: FormProps | undefined,
): Omit<FormProps, "sections"> | undefined {
  if (!options) return undefined;
  const { sections: _sections, ...rest } = options;
  return rest;
}

function serializeFormSections(
  sections: FormSection[] | undefined,
): FormSectionSerialized[] | undefined {
  return sections?.map(({ fields, ...section }) => ({
    ...section,
    fieldIds: fields.map((item) => item.id),
  }));
}

/** @internal */
export function createForm(
  options: FormProps | undefined,
  fields: FormFieldOrGroup[],
  schema: ReturnType<typeof buildFormSchema>,
  serializedFields: FormFieldOrGroupSerialized[],
) {
  const builder = new ComponentBuilder<FormPropsSerialized>(FORM_COMPONENT_NAME)
    .options({
      ...withoutSections(options),
      fields: serializedFields,
      ...(options?.sections && {
        sections: serializeFormSections(options.sections),
      }),
      schema: zodToJsonSchema(schema),
    })
    .transformOptions(StampUploadFieldTokens)
    .meta({
      name: options?.title || "Form",
      icon: "i-ph-note-pencil",
    });

  return Object.assign(builder, { fields });
}

/** @internal */
export function formComponent<T>(name: string, options?: T) {
  return new ComponentBuilder<T>(name).options(options).serializeSync();
}

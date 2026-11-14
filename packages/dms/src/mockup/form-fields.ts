import type { BlockTypeDescriptor } from "@antelopejs/interface-dms/base/block-types";
import { CreateDataType } from "@antelopejs/interface-dms/base/data-types";
import { z } from "zod";
import type { Json, JsonObject, MockupIssue } from "./model";
import { jsonObjectSchema, jsonSchema } from "./model";
import { FORM_COMPONENT } from "./validate";

const entriesSchema = z.array(jsonSchema);
const sectionsSchema = z.array(jsonObjectSchema);

function typeInput(
  type: Json,
  at: string,
  issues: MockupIssue[],
): Json | undefined {
  const id = z.string().safeParse(type);
  if (!id.success) {
    issues.push({
      path: at,
      message:
        'a field\'s type is a data type id: "string", "number", "date"...',
    });
    return undefined;
  }
  try {
    return jsonSchema.parse(
      JSON.parse(JSON.stringify(CreateDataType(id.data).inputComponent())),
    );
  } catch {
    issues.push({
      path: at,
      message: `the data type "${id.data}" gives no input: it is not registered, or it needs options a mockup cannot give, so write the field's component`,
    });
    return undefined;
  }
}

/**
 * The field as the form component reads it, with the `component` the `Form` factory
 * gives it: the one written, else its `inputComponent`, else its data type's
 * input, a written `null` counting as none. A group's fields get theirs. A field left with no input is dropped,
 * its issue reported, since the component cannot draw it.
 */
function withInput(
  entry: Json,
  at: string,
  issues: MockupIssue[],
): Json | undefined {
  const parsed = jsonObjectSchema.safeParse(entry);
  if (!parsed.success) return entry;
  const field = parsed.data;
  const group = entriesSchema.safeParse(field.fields);
  if (group.success) {
    return { ...field, fields: withInputs(group.data, `${at}/fields`, issues) };
  }
  const { inputComponent, component: _component, ...rest } = field;
  const written = jsonObjectSchema.safeParse(field.component ?? inputComponent);
  if (written.success) return { ...rest, component: written.data };
  if (field.type === undefined) return undefined;
  const component = typeInput(field.type, `${at}/type`, issues);
  return component === undefined ? undefined : { ...rest, component };
}

function withInputs(
  entries: readonly Json[],
  at: string,
  issues: MockupIssue[],
): Json[] {
  return entries.flatMap((entry, index) => {
    const field = withInput(entry, `${at}/${index}`, issues);
    return field === undefined ? [] : [field];
  });
}

/**
 * The options of a block emitting the form component with an input on every field, in
 * `fields` and in each section's `fields`; other blocks' options as they are.
 * `pointer` is the node's options in the spec.
 */
export function withFieldInputs(
  descriptor: BlockTypeDescriptor,
  options: JsonObject,
  pointer: string,
  issues: MockupIssue[],
): JsonObject {
  if (descriptor.componentName !== FORM_COMPONENT) return options;
  const fields = entriesSchema.safeParse(options.fields);
  const sections = sectionsSchema.safeParse(options.sections);
  return {
    ...options,
    ...(fields.success && {
      fields: withInputs(fields.data, `${pointer}/fields`, issues),
    }),
    ...(sections.success && {
      sections: sections.data.map((section, index) => {
        const held = entriesSchema.safeParse(section.fields);
        if (!held.success) return section;
        const at = `${pointer}/sections/${index}/fields`;
        return { ...section, fields: withInputs(held.data, at, issues) };
      }),
    }),
  };
}

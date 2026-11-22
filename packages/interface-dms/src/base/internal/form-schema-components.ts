/** @internal */
import { ComponentBuilder } from "../../component";
import { StampUploadFieldTokens } from "../../uploads";
import { z } from "zod";
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
import { isString } from "../../utils/internal/type-check";

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

/**
 * The zod string formats the browser checks by their JSON Schema `format`
 * alone, since `json-schema-to-zod` rebuilds each as zod's own check.
 */
const BROWSER_CHECKED_FORMATS: ReadonlySet<string> = new Set([
  "email",
  "uuid",
  "url",
  "datetime",
  "date",
  "time",
  "ipv4",
  "ipv6",
  "duration",
]);

/**
 * The pattern a string format the browser checks by its `format` (an e-mail,
 * a uuid, a date-time) checks with, as opposed to one `.regex()` or another
 * format adds.
 */
function formatPattern(
  def: z.core.$ZodTypeDef | z.core.$ZodCheckDef,
): string | undefined {
  if (!("check" in def) || def.check !== "string_format") return undefined;
  if (!("format" in def) || !isString(def.format)) return undefined;
  if (!BROWSER_CHECKED_FORMATS.has(def.format)) return undefined;
  return "pattern" in def && def.pattern instanceof RegExp
    ? def.pattern.source
    : undefined;
}

/**
 * Drops the patterns of the formats the browser checks by their `format`: the
 * same check written twice reports every bad value twice.
 */
function dropFormatPatterns(
  schema: z.core.$ZodType,
  checks: readonly z.core.$ZodCheck<never>[],
  json: z.core.JSONSchema.BaseSchema,
): void {
  const dropped = new Set(
    [schema, ...checks].flatMap((node) => formatPattern(node._zod.def) ?? []),
  );
  const isDropped = (part: z.core.JSONSchema.BaseSchema) =>
    isString(part.pattern) && dropped.has(part.pattern);
  if (isDropped(json)) delete json.pattern;
  if (!json.allOf) return;
  const [only, ...others] = json.allOf.filter((part) => !isDropped(part));
  delete json.allOf;
  if (only && others.length > 0) json.allOf = [only, ...others];
  else if (only) json.pattern = only.pattern;
}

/**
 * The JSON Schema of a form's values the browser validates against: what each
 * field accepts as input, in draft-07, with a date written as a `date-time`
 * string, an object that strips unknown keys refusing them, a string format
 * checked by its `format` alone, and a kind JSON Schema cannot express
 * accepting anything.
 *
 * @internal
 */
export function formJsonSchema(
  schema: z.core.$ZodType,
): z.core.JSONSchema.BaseSchema {
  return z.toJSONSchema(schema, {
    target: "draft-07",
    io: "input",
    unrepresentable: "any",
    override: ({ zodSchema, jsonSchema }) => {
      const def = zodSchema._zod.def;
      if (def.type === "date") {
        jsonSchema.type = "string";
        jsonSchema.format = "date-time";
      } else if (def.type === "object" && def.catchall === undefined) {
        jsonSchema.additionalProperties = false;
      } else if (def.type === "string") {
        dropFormatPatterns(zodSchema, def.checks ?? [], jsonSchema);
      }
    },
  });
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
      schema: formJsonSchema(schema),
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

/** @internal */
import { z } from "zod";
import { isNull, isObject, isString } from "../../utils/internal/type-check";
import { ComponentBuilder } from "../../component";
import type {
  adaptFieldValidationSchema,
  FormSchemaSource,
  isAcceptanceField,
} from "../form-schema";
import {
  isFieldGroup,
  type FormBuilder,
  type FormField,
  type FormFieldOrGroup,
  type FormProps,
} from "../form-types";

/** @internal */
export function buildSchema(
  fields: FormFieldOrGroup[],
  adapt: typeof adaptFieldValidationSchema,
  isAcceptance: typeof isAcceptanceField,
) {
  const properties: Record<string, z.ZodTypeAny> = {};

  function addFieldToSchema(field: FormField): void {
    const baseSchema =
      field.required && isAcceptance(field)
        ? z.literal(true)
        : field.type.getValidation();
    properties[field.id] = adapt(baseSchema, {
      localized: field.localized,
      required: field.required,
      fallbackLocale: field.fallbackLocale,
    });
  }

  for (const item of fields) {
    if (isFieldGroup(item)) {
      for (const field of item.fields) {
        addFieldToSchema(field);
      }
    } else {
      addFieldToSchema(item);
    }
  }

  return z.object(properties);
}

const REQUIRED_MESSAGE = "$dms.field_errors.required";

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Takes the output of a caller-supplied zod field schema, any on zod 3's ZodTypeAny, then trims text and checks that every other value is present.
function isFilledText(value: unknown): boolean {
  return isString(value) ? value.trim() !== "" : value != null;
}

function isLocaleMap(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !isNull(value);
}

/** @internal */
export function withFallbackLocale(
  schema: z.ZodTypeAny,
  fallbackLocale: string,
): z.ZodTypeAny {
  return schema.superRefine((value, context) => {
    if (!isLocaleMap(value)) return;
    const isAnyFilled = Object.values(value).some(isFilledText);
    if (!isAnyFilled || isFilledText(value[fallbackLocale])) return;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: REQUIRED_MESSAGE,
      path: [fallbackLocale],
    });
  });
}

const FIELDS_KEY = "fields";

/** @internal */
export function isFormBuilder(source: FormSchemaSource): source is FormBuilder {
  return source instanceof ComponentBuilder && FIELDS_KEY in source;
}

const SECTIONS_KEY = "sections";

/** @internal */
export function isFormProps(source: FormSchemaSource): source is FormProps {
  if (typeof source !== "object" || source === null) return false;
  return (
    (FIELDS_KEY in source && Array.isArray(source.fields)) ||
    (SECTIONS_KEY in source && Array.isArray(source.sections))
  );
}

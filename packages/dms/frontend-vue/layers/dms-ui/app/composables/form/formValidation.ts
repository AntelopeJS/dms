import type { z } from "zod";
import { isBlankValue } from "#dms-core/app/composables/useFormValidation";

/**
 * How the generic form validates its state on top of the schema the backend
 * sends: one rule for every field type of what "left empty" means.
 *
 * The schema alone cannot say it. It travels as JSON Schema, so a required
 * date that is still unpicked fails as "not a valid value" (its union of
 * string formats rejects `undefined`), an empty rich-text document
 * (`<p></p>`) or an address of empty parts passes or fails part by part, and
 * an optional email cleared to `""` is refused although nothing was entered.
 *
 * What counts as empty is `isBlankValue` (dms-core), the rule the hand-built
 * forms of the dashboard follow too.
 */

/** A field as the validation sees it. */
export interface FormValidationField {
  id: string;
  /** Data type id (`rich_text`, `address`, `date`…). */
  type?: string;
  /** Holds one value per content language. */
  localized?: boolean;
  /**
   * Whether the form requires a value now: declared so or set by a watch
   * action, and shown (see `isFieldMarkedRequired`).
   */
  required: boolean;
}

/** An issue in the shape UForm reads from a Standard Schema. */
export interface FormValidationIssue {
  message: string;
  path: PropertyKey[];
}

export type FormValidationResult =
  | { value: Record<string, unknown> }
  | { issues: FormValidationIssue[] };

export interface FormValidationContext {
  fields: readonly FormValidationField[];
  /** The message of a required field left empty, already translated. */
  requiredMessage: string;
  /** The language a localized field shows: its required error goes there. */
  locale?: string;
  /** Passed to zod (the error map wording its issues). */
  parseParams?: Partial<z.ParseParams>;
}

const BOOLEAN_TYPE = "boolean";

function issueField(issue: { path: PropertyKey[] }): PropertyKey | undefined {
  return issue.path[0];
}

/** An issue saying the value is not of a branch's type at all. */
function isTypeMismatch(issue: z.ZodIssue, path: PropertyKey[]): boolean {
  return issue.code === "invalid_type" && issue.path.length === path.length;
}

/**
 * The issues of a value refused by a union: zod reports one "matches no
 * branch" issue, though usually a single branch is of the value's type and
 * says what is wrong (an optional `<type> | null` once through JSON Schema,
 * a date range given as `{ start, end }` rather than a list). That branch's
 * issues replace it: an address part missing, a range end not picked. A
 * union with several such branches keeps its issue.
 */
export function unwrapUnionIssue(issue: z.ZodIssue): z.ZodIssue[] {
  if (issue.code !== "invalid_union") return [issue];
  const branches = issue.unionErrors.filter(
    (error) =>
      !error.issues.every((inner) => isTypeMismatch(inner, issue.path)),
  );
  if (branches.length !== 1) return [issue];
  return branches[0]!.issues.flatMap(unwrapUnionIssue);
}

/**
 * The value an empty field stands for: a switch never touched is off, any
 * other field holds nothing.
 */
function emptyValueOf(field: FormValidationField): false | null {
  return field.type === BOOLEAN_TYPE ? false : null;
}

/**
 * Validates a form state: the schema's issues, except that a required field
 * left empty gets the one "required" issue (and none of its type's), and a
 * field left empty in a shape its type refuses (`""` for an optional email,
 * an address of empty parts, a switch never touched) is read, and submitted,
 * as the empty value it stands for (`null`, or `false` for a switch).
 *
 * Issues come back in the order of the fields, so the first one is the first
 * invalid field of the form.
 */
export async function validateFormState(
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>,
  state: Record<string, unknown>,
  context: FormValidationContext,
): Promise<FormValidationResult> {
  const input: Record<string, unknown> = { ...state };
  const missing = new Set<string>();

  for (const field of context.fields) {
    const value = state[field.id];
    if (!isBlankValue(value, field.type)) continue;
    if (field.required) {
      missing.add(field.id);
      continue;
    }
    const fallback = emptyValueOf(field);
    if (value === fallback || (fallback === null && value === undefined)) {
      continue;
    }
    const fieldSchema = schema.shape[field.id];
    if (!fieldSchema) continue;
    const raw = await fieldSchema.safeParseAsync(value, context.parseParams);
    if (raw.success) continue;
    const empty = await fieldSchema.safeParseAsync(
      fallback,
      context.parseParams,
    );
    if (empty.success) input[field.id] = fallback;
  }

  const result = await schema.safeParseAsync(input, context.parseParams);
  const issues: FormValidationIssue[] = result.success
    ? []
    : result.error.issues
        .flatMap(unwrapUnionIssue)
        .filter((issue) => !missing.has(String(issueField(issue))))
        .map(({ message, path }) => ({ message, path }));

  for (const field of context.fields) {
    if (!missing.has(field.id)) continue;
    issues.push({
      message: context.requiredMessage,
      path:
        field.localized && context.locale
          ? [field.id, context.locale]
          : [field.id],
    });
  }

  if (issues.length === 0 && result.success) {
    return { value: result.data as Record<string, unknown> };
  }

  const order = new Map(
    context.fields.map((field, index) => [field.id, index]),
  );
  const rank = (issue: FormValidationIssue) =>
    order.get(String(issueField(issue))) ?? order.size;
  // A stable sort: issues of one field keep the schema's order.
  return { issues: [...issues].sort((a, b) => rank(a) - rank(b)) };
}

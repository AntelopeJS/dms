import { type Ref, watch } from "vue";
import type { ZodErrorMap, ZodType, ZodTypeDef } from "zod";
import { resolveApiMessage } from "./translation/useTranslation";
import { type ValidationIssue, validationIssueMessage } from "./useFieldErrors";

/**
 * Client-side checks of the hand-built forms (auth pages, onboarding,
 * settings panels), worded like the DMS form: an empty required control says
 * "This field is required.", a malformed one says why, under the control.
 */

/** A required control left empty. */
export const REQUIRED_MESSAGE = "$dms.field_errors.required";
/** A code entry (PIN cells) filled only in part. */
export const CODE_INCOMPLETE_MESSAGE = "$dms.field_errors.code_incomplete";
/** A new password that misses one of the listed rules. */
export const PASSWORD_RULES_MESSAGE = "$dms.field_errors.password_rules";

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** A UForm validation issue, as a Standard Schema reports it. */
interface FormIssue {
  message: string;
  path?: PropertyKey[];
}

type FormValidationResult<Output> =
  | { value: Output; issues?: undefined }
  | { issues: FormIssue[] };

/** A zod schema as the Standard Schema `UForm` validates with. */
export interface LocalizedSchema<Output> {
  "~standard": {
    version: 1;
    vendor: string;
    validate: (value: unknown) => Promise<FormValidationResult<Output>>;
  };
}

// Markup that is content on its own, without any text around it.
const RICH_TEXT_MEDIA = /<(img|hr|iframe|video|audio|embed|object)\b/i;
const HTML_TAG = /<[^>]*>/g;
const HTML_SPACE = /&nbsp;|&#160;|\u00A0/g;

/** Whether a rich-text document holds nothing: no text, no media. */
export function isRichTextBlank(html: string): boolean {
  if (RICH_TEXT_MEDIA.test(html)) return false;
  return html.replace(HTML_TAG, "").replace(HTML_SPACE, " ").trim() === "";
}

/**
 * Whether a value counts as "not filled": nothing, blanks, no item, a
 * cleared number, an empty rich-text document (`<p></p>`, with
 * `type` `rich_text`), or an object (address, date range, image,
 * translations) whose every part is blank. `false` and `0` are values;
 * inside an object a flag (an image's `principal`) is not content.
 *
 * @param type The DMS data type id of the value, when it changes the reading
 */
export function isBlankValue(value: unknown, type?: string): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") {
    return type === "rich_text" ? isRichTextBlank(value) : value.trim() === "";
  }
  if (typeof value === "number") return Number.isNaN(value);
  if (value instanceof Date) return Number.isNaN(value.getTime());
  if (Array.isArray(value)) {
    return value.every((item) => isBlankValue(item, type));
  }
  if (typeof value === "object") {
    return Object.values(value)
      .filter((part) => typeof part !== "boolean")
      .every((part) => isBlankValue(part, type));
  }
  return false;
}

/**
 * The message key of a zod issue the schema left unworded: "required" for a
 * blank value (zod would say the e-mail is malformed or the text too short),
 * else the dashboard's wording of the issue code.
 */
export function formIssueMessage(
  issue: ValidationIssue,
  data: unknown,
): string {
  return isBlankValue(data) ? REQUIRED_MESSAGE : validationIssueMessage(issue);
}

const issueErrorMap: ZodErrorMap = (issue, context) => ({
  message: formIssueMessage(issue, context.data),
});

/**
 * Wraps a zod schema for `UForm`: issues the schema does not word itself get
 * the dashboard's messages (translated), a `$key` message is translated, and
 * a message already in prose is kept.
 */
export function localizeSchema<Output, Input>(
  schema: ZodType<Output, ZodTypeDef, Input>,
  translate: Translate,
): LocalizedSchema<Output> {
  const resolve = (message: string) =>
    message.startsWith("$") ? resolveApiMessage(translate, message) : message;
  return {
    "~standard": {
      version: 1,
      vendor: "dms",
      validate: async (value) => {
        const result = await schema.safeParseAsync(value, {
          errorMap: issueErrorMap,
        });
        return result.success
          ? { value: result.data }
          : {
              issues: result.error.issues.map(({ message, path }) => ({
                message: resolve(message),
                path,
              })),
            };
      },
    },
  };
}

/** {@link localizeSchema} with the current locale. */
export function useLocalizedSchema<Output, Input>(
  schema: ZodType<Output, ZodTypeDef, Input>,
): LocalizedSchema<Output> {
  const { t } = useI18n();
  return localizeSchema(schema, (key, params = {}) => t(key, params));
}

/**
 * The error of a code entry on submit: required when no cell is filled,
 * incomplete when some are missing, none once every cell holds a digit.
 *
 * @returns A message key, or `undefined` for a complete code
 */
export function codeEntryError(
  cells: ReadonlyArray<string | number | null | undefined> | undefined,
  length: number,
): string | undefined {
  const code = (cells ?? []).map((cell) => String(cell ?? "").trim()).join("");
  if (code === "") return REQUIRED_MESSAGE;
  return code.length < length ? CODE_INCOMPLETE_MESSAGE : undefined;
}

/** The message key of a required value left empty, else `undefined`. */
export function requiredError(value: unknown): string | undefined {
  return isBlankValue(value) ? REQUIRED_MESSAGE : undefined;
}

/** What `UForm` exposes that {@link useLiveFormErrors} needs. */
export interface LiveFormHandle {
  getErrors: (name?: string) => ReadonlyArray<unknown>;
  validate: (options: { name: string; silent: boolean }) => Promise<unknown>;
}

/**
 * Re-checks a field in error as soon as its value changes. `UForm` only does
 * it once the field was left: a field flagged on submit (and focused) would
 * keep its message while the user fixes it. A field without an error is left
 * alone, so nothing shows while typing before the first blur or submit.
 *
 * @param form The page's `UForm`
 * @param state The form state, keyed by field name
 */
export function useLiveFormErrors(
  form: Ref<LiveFormHandle | null | undefined>,
  state: object,
): void {
  watch(
    () => ({ ...state }) as Record<string, unknown>,
    (current, previous) => {
      const handle = form.value;
      if (!handle) return;
      for (const name of Object.keys(current)) {
        if (current[name] === previous[name]) continue;
        if (handle.getErrors(name).length === 0) continue;
        void handle.validate({ name, silent: true }).catch(() => undefined);
      }
    },
  );
}

/**
 * Focuses the first control in error, in page order, after a failed submit.
 * `UForm` disables its fields while it validates: the focus waits a task for
 * them to be enabled again.
 *
 * @param errors The errors of the form (`UForm`'s `@error` event `errors`)
 */
export function focusFirstFormError(
  errors: ReadonlyArray<{ id?: string }>,
): void {
  if (typeof document === "undefined") return;
  setTimeout(() => {
    const [first] = errors
      .map((error) => (error.id ? document.getElementById(error.id) : null))
      .filter((element): element is HTMLElement => !!element)
      .sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
    first?.focus();
  });
}

import { nextTick, reactive } from "vue";
import {
  type I18nTranslate,
  resolveApiMessage,
} from "./translation/useTranslation";
import { resolveApiErrorMessage } from "./useApiError";
import { isBoolean, isNumber, isObject, isString } from "../utils/type-check";

/**
 * The dashboard's error rule: an error that belongs to one field (a value
 * refused by validation, a wrong current password, an address already used,
 * a name already taken…) shows under that field only; anything else (network
 * failure, permission denied, rate limit, server error) is a toast.
 *
 * This module tells the two apart from what `$authFetch` / `$fetch` threw.
 */

/** An API error tied to one field, before translation. */
export interface ApiFieldError {
  /** Id of the field, as the form names it (the request body key). */
  field: string;
  /**
   * What to show under the field: an i18n key (bare `error.xxx` or `$key`)
   * or prose, resolved with `resolveApiMessage`.
   */
  message: string;
  /** The values of the field the error names (addresses of a list…). */
  values?: string[];
  /**
   * Values filling the placeholders of the translated message: a body
   * `{ field: "budget", message: "$page.error.budget_max", params: { max: 5000 } }`
   * shows "At most 5000" for a translation `"At most {max}"`.
   */
  params?: ApiFieldErrorParams;
  /**
   * The part of the field the error names, as a dotted path from the field
   * (`address.streetName`, `title.fr`); absent when it names the field.
   */
  path?: string;
}

/** Placeholder values of a field error's message. */
export type ApiFieldErrorParams = Record<string, string | number | boolean>;

/** A code the API answers with that belongs to a field. */
export type FieldErrorCode<F extends string = string> =
  | F
  | {
      field: F;
      /** Shown instead of the code's own text. */
      message: string;
    };

export interface ResolveFieldErrorsOptions<F extends string = string> {
  /**
   * The fields of the form. An error naming another field (or none) is not
   * one the form can show: it stays a toast.
   */
  fields: readonly F[];
  /** API error codes (`error.xxx`, `$page.…`) that belong to a field. */
  codes?: Readonly<Record<string, FieldErrorCode<NoInfer<F>>>>;
}

export interface FieldErrorResolution {
  /** Errors to show under their field. */
  fields: ApiFieldError[];
  /**
   * The error also carries something no field of the form can show (a
   * validation issue on an unknown key): a toast tells about it.
   */
  hasUnmatched: boolean;
}

interface FetchErrorLike {
  statusCode?: number;
  status?: number;
  response?: { status?: number };
  data?: unknown;
}

interface FieldErrorBody {
  field?: unknown;
  message?: unknown;
  values?: unknown;
  params?: unknown;
  code?: unknown;
  fields?: unknown;
  issues?: unknown;
  errors?: unknown;
}

/** A zod issue, as the API serializes it or as zod hands it to an error map. */
export interface ValidationIssue {
  path?: unknown;
  message?: unknown;
  code?: unknown;
  validation?: unknown;
  minimum?: unknown;
  received?: unknown;
  type?: unknown;
}

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_CLIENT_ERROR_MAX = 499;

/** Statuses whose body may name the field it refuses. */
const VALIDATION_STATUSES = new Set([
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_UNPROCESSABLE,
]);

/** Never about a field, whatever the body says. */
const GLOBAL_STATUSES = new Set([HTTP_FORBIDDEN, HTTP_TOO_MANY_REQUESTS]);

const FIELD_ERROR_KEYS = {
  required: "$dms.field_errors.required",
  invalid: "$dms.field_errors.invalid",
  invalidEmail: "$dms.field_errors.invalid_email",
  tooLong: "$dms.field_errors.too_long",
  tooShort: "$dms.field_errors.too_short",
  tooSmall: "$dms.field_errors.too_small",
  tooLarge: "$dms.field_errors.too_large",
} as const;

/** Issue types whose size is a count (characters, items), not a value. */
const COUNTED_TYPES = new Set(["string", "array", "set"]);

const DATA_API_CODES: Readonly<
  Record<ReturnType<typeof resolveApiErrorMessage>, ApiFieldError["message"]>
> = {
  missing_mandatory_fields: FIELD_ERROR_KEYS.required,
  invalid_field_types: FIELD_ERROR_KEYS.invalid,
};

const NAMED_FIELD_ERROR_KEYS: Readonly<
  Record<ApiFieldError["message"], Parameters<I18nTranslate>[0]>
> = {
  [FIELD_ERROR_KEYS.required]: "dms.field_errors.named_required",
  [FIELD_ERROR_KEYS.invalid]: "dms.field_errors.named_invalid",
};

const FIELD_PREFIXED_MESSAGE = /^([\w.]+):\s+(.+)$/s;

const BARE_I18N_KEY = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i;

/** The HTTP status of a fetch error; undefined for a network failure. */
export function apiErrorStatus(
  error: Parameters<typeof resolveApiErrorMessage>[0],
): number | undefined {
  if (!isObject(error) || error === null) return undefined;
  const { statusCode, status, response }: FetchErrorLike = error;
  return statusCode ?? status ?? response?.status;
}

/** The error body, parsed when the server sent JSON as plain text. */
function bodyOf(
  error: Parameters<typeof resolveApiErrorMessage>[0],
): FetchErrorLike["data"] {
  if (!isObject(error) || error === null) return undefined;
  const { data } = error;
  if (!isString(data)) return data;
  const text = data.trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return data;
  try {
    return JSON.parse(text);
  } catch {
    return data;
  }
}

/** Whether a message is an i18n key rather than (English) prose. */
function isI18nKey(message: string): boolean {
  return message.startsWith("$") || BARE_I18N_KEY.test(message);
}

/** A zod issue's own message when it is a key, else a generic one. */
function tooSmallMessage(issue: ValidationIssue): string {
  if (issue.type !== undefined && !COUNTED_TYPES.has(String(issue.type))) {
    return FIELD_ERROR_KEYS.tooSmall;
  }
  return isNumber(issue.minimum) && issue.minimum <= 1
    ? FIELD_ERROR_KEYS.required
    : FIELD_ERROR_KEYS.tooShort;
}

/**
 * The message of a zod issue: its own when it is an i18n key, else a generic
 * `$dms.field_errors.*` key by issue code (zod words its own in English).
 */
export function validationIssueMessage(issue: ValidationIssue): string {
  if (isString(issue.message) && isI18nKey(issue.message)) {
    return issue.message;
  }
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" || issue.received === "null"
        ? FIELD_ERROR_KEYS.required
        : FIELD_ERROR_KEYS.invalid;
    case "too_small":
      return tooSmallMessage(issue);
    case "too_big":
      return issue.type !== undefined && !COUNTED_TYPES.has(String(issue.type))
        ? FIELD_ERROR_KEYS.tooLarge
        : FIELD_ERROR_KEYS.tooLong;
    case "invalid_string":
      return issue.validation === "email"
        ? FIELD_ERROR_KEYS.invalidEmail
        : FIELD_ERROR_KEYS.invalid;
    default:
      return FIELD_ERROR_KEYS.invalid;
  }
}

function isIssueList(
  body: ReturnType<typeof bodyOf>,
): body is Array<ValidationIssue & { path: unknown[] }> {
  return (
    Array.isArray(body) &&
    body.length > 0 &&
    body.every(
      (issue) => isObject(issue) && issue !== null && Array.isArray(issue.path),
    )
  );
}

/** `field.part.0` for a path reaching into a field, else undefined. */
function partPath(path: readonly unknown[]): string | undefined {
  if (path.length < 2) return undefined;
  return path.every((step) => isString(step) || isNumber(step))
    ? path.join(".")
    : undefined;
}

function fromIssues(
  issues: Array<ValidationIssue & { path: unknown[] }>,
): ApiFieldError[] {
  return issues.map((issue) => {
    const path = issue.path;
    const [field] = path;
    const part = partPath(path);
    return {
      field: isString(field) ? field : "",
      message: validationIssueMessage(issue),
      ...(part && { path: part }),
    };
  });
}

/** The placeholder values of a body, keeping only the plain ones. */
function paramsOf(
  params: FieldErrorBody["params"],
): ApiFieldErrorParams | undefined {
  if (!isObject(params) || params === null || Array.isArray(params)) {
    return undefined;
  }
  const entries = Object.entries(params).filter(
    (entry): entry is [string, ApiFieldErrorParams[string]] =>
      isString(entry[1]) || isNumber(entry[1]) || isBoolean(entry[1]),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** `{ field, message, values?, params? }`, the shape the DMS answers with. */
function fromFieldObject(body: FieldErrorBody): ApiFieldError[] {
  const { field, message, values, params } = body;
  if (!isString(field) || !isString(message)) return [];
  const placeholders = paramsOf(params);
  return [
    {
      field,
      message,
      values: Array.isArray(values) ? values.filter(isString) : undefined,
      ...(placeholders && { params: placeholders }),
    },
  ];
}

/** `{ code, fields }`, the data API's refusal of a body; undefined otherwise. */
function fromCodedFields(body: FieldErrorBody): ApiFieldError[] | undefined {
  const { code, fields } = body;
  const message = isString(code) ? DATA_API_CODES[code] : undefined;
  if (!message || !Array.isArray(fields)) return undefined;
  return fields.filter(isString).map((field) => ({ field, message }));
}

function fromText(text: string): ApiFieldError[] {
  const prefixed = FIELD_PREFIXED_MESSAGE.exec(text);
  if (prefixed) {
    const [, field, message] = prefixed;
    const part = partPath(field!.split("."));
    return [
      {
        field: field!.split(".")[0]!,
        message: isI18nKey(message!) ? message! : FIELD_ERROR_KEYS.invalid,
        ...(part && { path: part }),
      },
    ];
  }
  return [];
}

/** The text code of an error body: the body itself or its `message`. */
function codeOf(body: ReturnType<typeof bodyOf>): string | undefined {
  if (isString(body)) return body;
  if (isObject(body) && body !== null && !Array.isArray(body)) {
    const { message } = body;
    return isString(message) ? message : undefined;
  }
  return undefined;
}

function lookupCode<F extends string>(
  code: string | undefined,
  codes: Readonly<Record<string, FieldErrorCode<F>>> | undefined,
): ApiFieldError | undefined {
  if (!code || !codes) return undefined;
  const bare = code.startsWith("$") ? code.slice(1) : code;
  const entry = codes[code] ?? codes[bare] ?? codes[`$${bare}`];
  if (!entry) return undefined;
  return isString(entry)
    ? { field: entry, message: code }
    : { field: entry.field, message: entry.message };
}

function fromBody(body: ReturnType<typeof bodyOf>): ApiFieldError[] {
  if (isIssueList(body)) return fromIssues(body);
  if (isString(body)) return fromText(body);
  if (!isObject(body) || body === null) return [];
  const record: FieldErrorBody = body;
  if (isIssueList(record.issues)) return fromIssues(record.issues);
  if (isIssueList(record.errors)) return fromIssues(record.errors);
  return fromCodedFields(record) ?? fromFieldObject(record);
}

function isClientError(status: number | undefined): status is number {
  return (
    status !== undefined &&
    status >= HTTP_CLIENT_ERROR_MIN &&
    status <= HTTP_CLIENT_ERROR_MAX &&
    !GLOBAL_STATUSES.has(status)
  );
}

/**
 * Splits what a request threw into the errors its form shows under fields.
 *
 * Read, in order: a code the form maps to a field (`codes`, for any 4xx), a
 * zod issue list (what `assertValidation` answers), a `{ field, message }`
 * body (with optional `values` and `params`), the data API's
 * `{ code, fields }` and a `field: message` text. A network failure, a 403, a 429
 * or a 5xx never resolves to a field.
 *
 * @returns The field errors, one per field (the first issue wins), and
 *   whether part of the error belongs to no field of the form
 */
export function resolveFieldErrors<F extends string>(
  error: Parameters<typeof resolveApiErrorMessage>[0],
  options: ResolveFieldErrorsOptions<F>,
): FieldErrorResolution {
  const status = apiErrorStatus(error);
  if (!isClientError(status)) return { fields: [], hasUnmatched: true };
  const body = bodyOf(error);
  const mapped = lookupCode(codeOf(body), options.codes);
  const candidates = mapped
    ? [mapped]
    : VALIDATION_STATUSES.has(status)
      ? fromBody(body)
      : [];
  const known = new Set<string>(options.fields);
  const fields: ApiFieldError[] = [];
  let hasUnmatched = candidates.length === 0;
  for (const candidate of candidates) {
    if (!known.has(candidate.field)) {
      hasUnmatched = true;
      continue;
    }
    if (fields.some((entry) => entry.field === candidate.field)) continue;
    fields.push(candidate);
  }
  return { fields, hasUnmatched: hasUnmatched || fields.length === 0 };
}

/**
 * The data API's refusal of a body (`{ code, fields }`) as one sentence per
 * field naming it, translated: "Loss reason is required." Undefined for any
 * other error. `labelOf` gives a field's label, translated; the field's id
 * stands in for one it does not know.
 */
export function describeFieldErrors(
  error: Parameters<typeof resolveApiErrorMessage>[0],
  translate: I18nTranslate,
  labelOf: (field: string) => string | undefined,
): string | undefined {
  const status = apiErrorStatus(error);
  if (status === undefined || !VALIDATION_STATUSES.has(status)) {
    return undefined;
  }
  const body = bodyOf(error);
  if (!isObject(body) || body === null || Array.isArray(body)) {
    return undefined;
  }
  const entries = fromCodedFields(body);
  if (!entries?.length) return undefined;
  return entries
    .map(({ field, message }) =>
      translate(NAMED_FIELD_ERROR_KEYS[message]!, {
        field: labelOf(field) ?? field,
      }),
    )
    .join(" ");
}

/**
 * The message of an error that belongs to no field, for its toast: the API's
 * message key, the first validation issue's (or a generic one), else the
 * generic server error.
 */
export function describeApiError(
  error: Parameters<typeof resolveApiErrorMessage>[0],
): string {
  return apiErrorText(error) ?? resolveApiErrorMessage(error);
}

/**
 * The message an error body carries (its text, its `message`, or its first
 * validation issue's), or `undefined` when it carries none (a network
 * failure).
 */
export function apiErrorText(
  error: Parameters<typeof resolveApiErrorMessage>[0],
): string | undefined {
  const body = bodyOf(error);
  if (isIssueList(body)) return validationIssueMessage(body[0]!);
  const text = codeOf(body);
  return text || undefined;
}

/** Id of the element holding a field's inline error. */
export function fieldErrorId(controlId: string): string {
  return `${controlId}-error`;
}

/** Accessibility attributes of a control, from its inline error. */
export interface FieldErrorAria {
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

/**
 * The control of a field, focused when an error lands on it: its element id,
 * or a getter for a control whose id the caller cannot set (an input inside
 * a `UFormField`, which owns the id).
 */
export type FieldControl = string | (() => HTMLElement | null | undefined);

export interface UseFieldErrorsOptions<F extends string> {
  /** Each field of the form with its control (focused on error). */
  fields: Readonly<Record<F, FieldControl>>;
  /** API error codes that belong to a field; see {@link resolveFieldErrors}. */
  codes?: Readonly<Record<string, FieldErrorCode<NoInfer<F>>>>;
}

export interface HandleApiErrorOptions {
  /** i18n key of the toast title when the error belongs to no field. */
  toastTitle: string;
  /**
   * i18n key of the toast description; the API's message (translated) by
   * default.
   */
  toastDescription?: string;
}

/**
 * Inline errors of a form, following the dashboard's error rule: a
 * field-tied error shows under its field (red text, the control marked
 * `aria-invalid` and described by it, focused on a failed submit), anything
 * else is a toast.
 *
 * Bind `errors[field]` to the message element (id `errorId(field)`) and
 * `aria(field)` onto the control; call `clear(field)` when its value changes.
 */
/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- Object.keys erases F. The options owner and resolveFieldErrors membership check cannot prove runtime extra keys are F. Filtering would change extra-key behavior. */
export function useFieldErrors<F extends string>(
  options: UseFieldErrorsOptions<F>,
) {
  const { t } = useI18n();
  const toast = useToast();
  const translate = (key: string, params: Parameters<I18nTranslate>[1] = {}) =>
    t(key, params);
  const fieldIds = Object.keys(options.fields) as F[];
  const errors: Partial<Record<F, string>> = reactive({});

  function controlId(field: F): string {
    const control = options.fields[field];
    return isString(control) ? control : `field-${field}`;
  }

  function errorId(field: F): string {
    return fieldErrorId(controlId(field));
  }

  function aria(field: F): FieldErrorAria {
    const hasError = !!errors[field];
    return {
      "aria-invalid": hasError || undefined,
      "aria-describedby": hasError ? errorId(field) : undefined,
    };
  }

  function clear(field?: F): void {
    for (const key of field ? [field] : fieldIds) delete errors[key];
  }

  async function focus(field: F): Promise<void> {
    await nextTick();
    if (typeof document === "undefined") return;
    const control = options.fields[field];
    const element = isString(control)
      ? document.getElementById(control)
      : control();
    element?.focus();
  }

  /**
   * Shows an error under a field and focuses it (a client-side check that
   * failed on submit).
   *
   * @param message The text, already translated
   */
  async function setError(field: F, message: string): Promise<void> {
    errors[field] = message;
    await focus(field);
  }

  /**
   * Shows the field-tied part of an API error under its fields and focuses
   * the first one.
   *
   * @returns Whether the error was a field one; `false` leaves it to the
   *   caller (a toast)
   */
  async function applyApiError(
    error: Parameters<typeof resolveApiErrorMessage>[0],
  ): Promise<boolean> {
    const { fields } = resolveFieldErrors(error, {
      fields: fieldIds,
      codes: options.codes,
    });
    if (fields.length === 0) return false;
    clear();
    for (const entry of fields) {
      errors[entry.field as F] = resolveApiMessage(
        translate,
        entry.message,
        entry.params,
      );
    }
    await focus(fields[0]!.field as F);
    return true;
  }

  /** The toast of an error that belongs to no field. */
  function toastError(
    error: Parameters<typeof resolveApiErrorMessage>[0],
    toastOptions: HandleApiErrorOptions,
  ) {
    toast.add({
      title: t(toastOptions.toastTitle),
      description: toastOptions.toastDescription
        ? t(toastOptions.toastDescription)
        : resolveApiMessage(translate, describeApiError(error)),
      color: "error",
    });
  }

  /**
   * {@link applyApiError}, else a toast.
   *
   * @returns Whether the error went under a field
   */
  async function handleApiError(
    error: Parameters<typeof resolveApiErrorMessage>[0],
    toastOptions: HandleApiErrorOptions,
  ): Promise<boolean> {
    if (await applyApiError(error)) return true;
    toastError(error, toastOptions);
    return false;
  }

  return {
    errors,
    errorId,
    aria,
    clear,
    focus,
    setError,
    applyApiError,
    handleApiError,
    toastError,
  };
}

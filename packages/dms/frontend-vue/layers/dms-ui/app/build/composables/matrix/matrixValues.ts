import {
  MATRIX_LONG_TEXT_LENGTH,
  MATRIX_PANEL_KINDS,
  type MatrixCellKind,
  type MatrixColumn,
  type MatrixEditIn,
} from "../../../types/matrix";

const DEFAULT_KIND: MatrixCellKind = "text";
const LINE_BREAK = "\n";
/** Typed in a nullable text cell, it empties the cell. */
export const NULL_DRAFT = "null";
// In a nullable text cell the text "null" itself is typed escaped, `\null`
// (and `\\null` for `\null`): an editor opens such a text with one more
// backslash, and reading a draft takes one away.
const NULL_LIKE_TEXT = /^\\*null$/;
const ESCAPED_NULL = /^\\+null$/;
const NO_INDENT = 0;
const JSON_INDENT = 2;

/** The kind a column draws and edits its cells as. */
export function kindOf(column: Pick<MatrixColumn, "kind">): MatrixCellKind {
  return column.kind ?? DEFAULT_KIND;
}

/** Nothing in the cell: no value, an empty text, an empty list. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

/** An object or a list: drawn as JSON. */
export function isStructuredValue(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * Two cell values hold the same thing: an object compared by its JSON, and
 * every empty value (none, `""`, `[]`) alike, so an editor opened on an empty
 * cell and left as it was changes nothing.
 */
export function isSameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (isEmptyValue(left) || isEmptyValue(right))
    return isEmptyValue(left) && isEmptyValue(right);
  if (!isStructuredValue(left) || !isStructuredValue(right)) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** `{3}` for an object of three keys, `[2]` for a list of two items. */
export function structuredSizeTag(value: object): string {
  const size = Object.keys(value).length;
  return Array.isArray(value) ? `[${size}]` : `{${size}}`;
}

/** A value on one line, as a cell or a CSV writes it. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (isStructuredValue(value)) return JSON.stringify(value, null, NO_INDENT);
  return String(value);
}

/** Stands for no value where one is listed (a "was", a review line). */
export const EMPTY_MARK = "—";

/** A value on one line, or the empty mark for none. */
export function shownValueText(value: unknown): string {
  return isEmptyValue(value) ? EMPTY_MARK : valueText(value);
}

/** The text an editor opens with for a value. */
export function draftTextOf(value: unknown, kind: MatrixCellKind): string {
  if (value === null || value === undefined) return "";
  if (kind === "json") return JSON.stringify(value, null, JSON_INDENT);
  return valueText(value);
}

/**
 * The value a typed text stands for. In a nullable cell `null` empties it,
 * and a backslash before it writes the text (`\null` → "null").
 */
export function parseTextDraft(draft: string, nullable?: boolean): unknown {
  if (!nullable) return draft;
  if (draft.trim() === NULL_DRAFT) return null;
  return ESCAPED_NULL.test(draft) ? draft.slice(1) : draft;
}

/** The text a cell's editor opens with: see the escape above. */
export function textDraftOf(value: unknown, nullable?: boolean): string {
  const text = valueText(value);
  return nullable && typeof value === "string" && NULL_LIKE_TEXT.test(value)
    ? `\\${text}`
    : text;
}

/** A finite number, or `undefined` for a draft that is none. */
export function parseNumberDraft(draft: unknown): number | null | undefined {
  if (draft === null || draft === undefined || draft === "") return null;
  if (typeof draft === "number")
    return Number.isFinite(draft) ? draft : undefined;
  const parsed = Number(String(draft).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The outcome of reading a JSON draft. */
export interface JsonDraftResult {
  ok: boolean;
  value?: unknown;
  /** The parser's own words, after a failure. */
  detail?: string;
}

export function parseJsonDraft(draft: string): JsonDraftResult {
  if (draft.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(draft) };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : undefined,
    };
  }
}

/** Why a value is refused before it is sent: an i18n key under `dms.matrix.invalid`. */
export type MatrixInvalidReason =
  | "required"
  | "integer"
  | "number"
  | "min"
  | "max"
  | "json"
  | "datetime";

type ValueCheck = (
  column: MatrixColumn,
  value: unknown,
) => MatrixInvalidReason | null;

const checkRequired: ValueCheck = (column, value) =>
  column.required && isEmptyValue(value) ? "required" : null;

const checkNumber: ValueCheck = (column, value) => {
  if (kindOf(column) !== "number" || value === null || value === undefined)
    return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return "number";
  if (column.integer && !Number.isInteger(value)) return "integer";
  if (column.min !== undefined && value < column.min) return "min";
  if (column.max !== undefined && value > column.max) return "max";
  return null;
};

const VALUE_CHECKS: ValueCheck[] = [checkRequired, checkNumber];

/** The first reason the column refuses the value, or `null` when it takes it. */
export function validateMatrixValue(
  column: MatrixColumn,
  value: unknown,
): MatrixInvalidReason | null {
  for (const check of VALUE_CHECKS) {
    const reason = check(column, value);
    if (reason) return reason;
  }
  return null;
}

const TEXT_KINDS: ReadonlySet<MatrixCellKind> = new Set(["text", "longText"]);

/** A text too long or too tall for a one-line cell. */
function isLongText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.includes(LINE_BREAK) || value.length > MATRIX_LONG_TEXT_LENGTH;
}

const EDIT_IN_PANEL: Record<
  MatrixEditIn,
  (kind: MatrixCellKind, value: unknown) => boolean
> = {
  cell: () => false,
  panel: () => true,
  auto: (kind, value) =>
    MATRIX_PANEL_KINDS.includes(kind) ||
    (TEXT_KINDS.has(kind) && isLongText(value)),
};

/** Kinds whose value is written as text: an object there is no text. */
const STRING_KINDS: ReadonlySet<MatrixCellKind> = new Set([
  "text",
  "longText",
  "code",
]);

/**
 * The column a cell is edited as: its own, or `json` for an object or a list
 * found in a text column, so it is never written back as a JSON string.
 */
export function editingColumnOf(
  column: MatrixColumn,
  value: unknown,
): MatrixColumn {
  if (!STRING_KINDS.has(kindOf(column)) || !isStructuredValue(value))
    return column;
  return { ...column, kind: "json" };
}

/**
 * Whether a cell is edited in a drawer rather than in place: the cell's
 * `editIn`, else the column's, else (`auto`) by its kind (json, code...) and
 * for a text by its value (long, on several lines). An object in a text
 * column always goes to the drawer, edited as JSON.
 */
export function editsInPanel(
  column: MatrixColumn,
  value: unknown,
  cellEditIn?: MatrixEditIn,
): boolean {
  if (editingColumnOf(column, value) !== column) return true;
  const editIn = cellEditIn ?? column.editIn ?? "auto";
  return EDIT_IN_PANEL[editIn](kindOf(column), value);
}

/** The kinds a typed character may start editing (as a spreadsheet does). */
const TYPE_TO_EDIT_KINDS: ReadonlySet<MatrixCellKind> = new Set([
  "text",
  "longText",
  "number",
]);

export function acceptsTypedStart(column: MatrixColumn): boolean {
  return TYPE_TO_EDIT_KINDS.has(kindOf(column));
}

/** A number cell's value counted in a total; anything else counts nothing. */
export function numericValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A date and time as a `datetime-local` input takes it, in local time. */
export function datetimeInputOf(value: unknown): string {
  if (isEmptyValue(value)) return "";
  const date = new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return "";
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const EDITOR_MODELS: Partial<
  Record<MatrixCellKind, (value: unknown) => unknown>
> = {
  json: (value) => draftTextOf(value, "json"),
  datetime: datetimeInputOf,
  number: (value) => parseNumberDraft(value) ?? null,
  boolean: (value) => value === true,
  tags: (value) => (Array.isArray(value) ? value.map(String) : []),
  select: (value) => (isEmptyValue(value) ? undefined : String(value)),
  date: (value) => (isEmptyValue(value) ? undefined : String(value)),
  richText: (value) => (typeof value === "string" ? value : ""),
  address: (value) => (isStructuredValue(value) ? value : null),
};

/**
 * What the input of a kind is bound to for a cell's value: the text of a
 * JSON value, a finite number, a list of tags... A text kind takes a string.
 */
export function editorModelOf(column: MatrixColumn, value: unknown): unknown {
  const toModel = EDITOR_MODELS[kindOf(column)];
  return toModel ? toModel(value) : textDraftOf(value, column.nullable);
}

/** A value the column takes. */
export interface EditorValueAccepted {
  ok: true;
  value: unknown;
}

/** A model the column refuses, and why. */
export interface EditorValueRefused {
  ok: false;
  reason: MatrixInvalidReason;
  /** The parser's own words (a JSON syntax error). */
  detail?: string;
}

/** The value an editor's model stands for, or why the column refuses it. */
export type EditorValueResult = EditorValueAccepted | EditorValueRefused;

type ModelReader = (column: MatrixColumn, model: unknown) => EditorValueResult;

const readText: ModelReader = (column, model) => ({
  ok: true,
  value: parseTextDraft(
    typeof model === "string" ? model : "",
    column.nullable,
  ),
});

const MODEL_READERS: Partial<Record<MatrixCellKind, ModelReader>> = {
  text: readText,
  longText: readText,
  code: readText,
  json: (_column, model) => {
    const parsed = parseJsonDraft(typeof model === "string" ? model : "");
    return parsed.ok
      ? { ok: true, value: parsed.value }
      : { ok: false, reason: "json", detail: parsed.detail };
  },
  number: (_column, model) => {
    const parsed = parseNumberDraft(model);
    return parsed === undefined
      ? { ok: false, reason: "number" }
      : { ok: true, value: parsed };
  },
  select: (_column, model) => ({ ok: true, value: model ?? null }),
  date: (_column, model) => ({ ok: true, value: model || null }),
  datetime: (_column, model) => {
    if (!model) return { ok: true, value: null };
    const date = new Date(String(model));
    return Number.isNaN(date.getTime())
      ? { ok: false, reason: "datetime" }
      : { ok: true, value: date.toISOString() };
  },
};

/**
 * The value to write for an editor's model, checked against the column
 * (required, whole number, bounds, JSON) before anything is sent.
 */
export function valueFromEditorModel(
  column: MatrixColumn,
  model: unknown,
): EditorValueResult {
  const reader = MODEL_READERS[kindOf(column)];
  const read: EditorValueResult = reader
    ? reader(column, model)
    : { ok: true, value: model };
  if (!read.ok) return read;
  const reason = validateMatrixValue(column, read.value);
  return reason ? { ok: false, reason } : read;
}

/** A condition on a row's values: its value in `field` is one of `in`. */
export interface MatrixValueCondition {
  field: string;
  in: readonly unknown[];
}

/** Whether a row's values meet a condition; no condition is always met. */
export function meetsCondition(
  values: Record<string, unknown>,
  condition: MatrixValueCondition | undefined,
): boolean {
  if (!condition) return true;
  return condition.in.includes(values[condition.field]);
}

/**
 * Whether an editor's model still holds what it opened with: the user
 * changed nothing, and the cell keeps its value as stored (a date and time
 * keeps its seconds, which its input does not show).
 */
export function isUnchangedModel(
  column: MatrixColumn,
  model: unknown,
  original: unknown,
): boolean {
  return (
    JSON.stringify(model ?? null) ===
    JSON.stringify(editorModelOf(column, original) ?? null)
  );
}

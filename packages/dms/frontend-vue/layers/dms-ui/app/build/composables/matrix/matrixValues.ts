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
/** Typed in a text cell, it writes the word "null" itself. */
export const ESCAPED_NULL_DRAFT = "\\null";
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

/** The text an editor opens with for a value. */
export function draftTextOf(value: unknown, kind: MatrixCellKind): string {
  if (value === null || value === undefined) return "";
  if (kind === "json") return JSON.stringify(value, null, JSON_INDENT);
  return valueText(value);
}

/**
 * The value a typed text stands for: `null` empties a nullable cell, and
 * `\null` writes the word itself.
 */
export function parseTextDraft(draft: string, nullable?: boolean): unknown {
  if (draft === ESCAPED_NULL_DRAFT) return NULL_DRAFT;
  if (nullable && draft.trim() === NULL_DRAFT) return null;
  return draft;
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
  | "json";

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

/**
 * Whether a cell is edited in a drawer rather than in place: `editIn`, or by
 * default its kind (json, code...) and, for a text, its value.
 */
export function editsInPanel(column: MatrixColumn, value: unknown): boolean {
  return EDIT_IN_PANEL[column.editIn ?? "auto"](kindOf(column), value);
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

const asString = (value: unknown): string =>
  isStructuredValue(value) ? JSON.stringify(value) : valueText(value);

const EDITOR_MODELS: Partial<
  Record<MatrixCellKind, (value: unknown) => unknown>
> = {
  json: (value) => draftTextOf(value, "json"),
  number: (value) => parseNumberDraft(value) ?? null,
  boolean: (value) => value === true,
  tags: (value) => (Array.isArray(value) ? value.map(String) : []),
  select: (value) => (isEmptyValue(value) ? undefined : String(value)),
  date: (value) => (isEmptyValue(value) ? undefined : String(value)),
  richText: (value) => (typeof value === "string" ? value : ""),
  keyValue: (value) => (isStructuredValue(value) ? value : {}),
  address: (value) => (isStructuredValue(value) ? value : null),
};

/**
 * What the input of a kind is bound to for a cell's value: the text of a
 * JSON value, a finite number, a list of tags... A text kind takes a string.
 */
export function editorModelOf(column: MatrixColumn, value: unknown): unknown {
  const toModel = EDITOR_MODELS[kindOf(column)];
  return toModel ? toModel(value) : asString(value);
}

/** The value an editor's model stands for, or why the column refuses it. */
export type EditorValueResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: MatrixInvalidReason; detail?: string };

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

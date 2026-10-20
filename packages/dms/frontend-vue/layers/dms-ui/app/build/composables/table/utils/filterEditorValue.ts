// A view or tab declares its filter value as text (`TableViewTabFilter.value`),
// the shape the query sends. The chip's value editor wants the value its own
// type holds: a number input refuses "0", a switch "true", a date range
// "start,end". The editor reads the converted value; the filter keeps its text
// until the user edits it, so the query is unchanged.

type EditorValueConverter = (value: string) => unknown;

const LIST_SEPARATOR = ",";

const toNumber: EditorValueConverter = (value) => {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : value;
};

const BOOLEAN_TEXT: Record<string, boolean> = { true: true, false: false };

const toBoolean: EditorValueConverter = (value) =>
  BOOLEAN_TEXT[value.trim()] ?? value;

const toList: EditorValueConverter = (value) =>
  value.split(LIST_SEPARATOR).map((item) => item.trim());

/** What each typed value editor holds, by component name. */
const EDITOR_VALUE_CONVERTERS: Record<string, EditorValueConverter> = {
  "dms-input-number": toNumber,
  "dms-input-percentage": toNumber,
  "dms-slider": toNumber,
  "dms-switch": toBoolean,
  "dms-checkbox": toBoolean,
  "dms-boolean-card": toBoolean,
  "dms-date-picker-range": toList,
};

/**
 * The value a filter's editor component reads: a text value converted to the
 * type the component holds, any other value as it is.
 */
export function filterEditorValue(
  componentName: string | undefined,
  value: unknown,
): unknown {
  if (typeof value !== "string" || !componentName) return value;
  const convert = EDITOR_VALUE_CONVERTERS[componentName];
  return convert ? convert(value) : value;
}

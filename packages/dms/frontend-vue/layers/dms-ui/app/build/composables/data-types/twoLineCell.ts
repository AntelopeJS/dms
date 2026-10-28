import { h, type VNodeChild } from "vue";
import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { getAppComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";
import {
  type ComposableText,
  isComposedText,
} from "../../../../../dms-core/app/utils/composedText";
import { readRowField, readSubline, toneClass, type Row } from "./cellHelpers";

const EMPTY = "—";
const PRIMARY_CLASS = "text-highlighted truncate text-[13px] font-medium";
const EMPTY_PRIMARY_CLASS = "text-dimmed truncate text-[13px]";
const SUB_CLASS = "truncate text-xs";

interface TwoLineOptions {
  /** Row field holding the primary line, in place of the column's value. */
  primaryField?: string;
  /** Row field holding the secondary line. */
  subField?: string;
  /** Tone of the secondary line when the row gives none. */
  subTone?: string;
  /** Text of an empty primary line. */
  emptyLabel?: string;
  /** The column's own data type, which writes its value. */
  columnType?: string;
  /** The column's own type options (a select's items). */
  typeOptions?: unknown;
}

const isBlank = (value: Parameters<DataTypeFormatter>[0]): boolean =>
  value === null || value === undefined || value === "";

/** The column's value written by the column's own data type. */
function formatColumnValue(
  value: Parameters<DataTypeFormatter>[0],
  locale: string,
  opts: TwoLineOptions,
  row: Row,
): VNodeChild {
  const { getDataType } = useDataTypes();
  const formatter = opts.columnType
    ? getDataType(opts.columnType)?.formatter
    : undefined;
  const format = formatter?.cell ?? formatter?.default;
  if (!format) return String(value);
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DataTypeFormatter returns unknown; the existing cell forwards that result to Vue without checking VNodeChild.
  return format(value, locale, opts.typeOptions, row) as VNodeChild;
}

/** The primary line, or nothing when the row has none to show. */
function readPrimary(
  value: Parameters<DataTypeFormatter>[0],
  locale: string,
  opts: TwoLineOptions,
  row: Row,
): VNodeChild | undefined {
  const { processText } = getAppComposedText();
  if (opts.primaryField) {
    const text = processText(
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Row fields are open plugin values; processText receives the same unchecked value rather than a newly filtered or coerced one.
      readRowField(row, opts.primaryField) as ComposableText,
    );
    return text || undefined;
  }
  if (isBlank(value)) return undefined;
  if (isComposedText(value)) return processText(value);
  return formatColumnValue(value, locale, opts, row);
}

/**
 * `two_line`: a primary line — the column's value in its own format, or a row
 * field's text — over a secondary line read off the row, in the row's tone,
 * else `subTone`, else muted. No avatar.
 */
function renderTwoLine(
  value: Parameters<DataTypeFormatter>[0],
  locale: string,
  options: Parameters<DataTypeFormatter>[2],
  row: Row,
) {
  const { processText } = getAppComposedText();
  const opts: TwoLineOptions = options ?? {};
  const primary = readPrimary(value, locale, opts, row);
  const sub = readSubline(readRowField(row, opts.subField), {
    processText,
    isStringTranslated: true,
  });
  return h("span", { class: "flex min-w-0 flex-col leading-tight" }, [
    primary === undefined
      ? h(
          "span",
          { class: EMPTY_PRIMARY_CLASS },
          opts.emptyLabel ? processText(opts.emptyLabel) : EMPTY,
        )
      : h("span", { class: PRIMARY_CLASS }, [primary]),
    sub
      ? h(
          "span",
          {
            class: [SUB_CLASS, toneClass(sub.tone ?? opts.subTone, "muted")],
            title: sub.text,
          },
          sub.text,
        )
      : null,
  ]);
}

/**
 * The `two_line` cell data type. It draws an empty value too: its primary
 * line may come from another field, and its secondary line always does.
 */
export const registerTwoLineCellType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "two_line",
    formatter: { default: renderTwoLine, empty: renderTwoLine },
  });
};

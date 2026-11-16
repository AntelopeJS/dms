import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { isNumber, isObject, isString } from "#dms-core/app/utils/type-check";
import { isDataTypeRow, textOf } from "#dms-core/app/build/utils/dataTypeValue";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import { childOf, readRowTone, type Row } from "./cellHelpers";
import {
  dateFilterEditorValue,
  numberFilterEditorValue,
} from "../table/utils/filterEditorValue";
import { formatDuration } from "#dms-core/app/utils/formatter";
import { withNumberSuffix } from "./numberSuffix";
import { DMS_TONE_TEXT } from "../../utils/tone";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";

type CellOptions = Parameters<DataTypeFormatter>[2];

type CellValue = Parameters<DataTypeFormatter>[0];

const convertToBoolean = (value: CellValue): boolean =>
  parse(textOf(value)) === true;

const getBooleanLabel = (value: CellValue): string => {
  const { processI18n } = getAppTranslation();
  return convertToBoolean(value)
    ? processI18n("$dms.table.filter.boolean.checked")
    : processI18n("$dms.table.filter.boolean.unchecked");
};

function renderBoolean(value: CellValue) {
  const boolValue = convertToBoolean(value);
  return h("div", { class: "flex items-center gap-1" }, [
    h(UIcon, { name: boolValue ? "i-ph-check-circle" : "i-ph-x-circle" }),
    h("span", getBooleanLabel(value)),
  ]);
}

function dateBoundsOf(value: CellValue): [CellValue, CellValue] {
  if (Array.isArray(value)) return [value[0], value[1]];
  return isDataTypeRow(value)
    ? [value.start, value.end]
    : [undefined, undefined];
}

function formatDateBetween(value: CellValue, locale: string): string {
  const { t } = getAppTranslation();
  const [rawStart, rawEnd] = dateBoundsOf(value);
  const start = formatDate(rawStart, locale) ?? t("dms.date.undefined");
  const end = formatDate(rawEnd, locale) ?? t("dms.date.undefined");
  return `${start} - ${end}`;
}

function formatAddress(value: CellValue): string {
  if (!value || !isObject(value)) return " ";

  const { processI18n } = getAppTranslation();
  const part = (key: string): string | number | undefined => {
    const text = isDataTypeRow(value) ? value[key] : undefined;
    return isString(text) || isNumber(text) ? text : undefined;
  };
  const countryCode = part("countryCode");
  const countryName = countryCode
    ? processI18n(`$country.${countryCode}`)
    : countryCode;
  const number = [part("houseNumber"), part("boxNumber")]
    .filter(Boolean)
    .join("/");
  const street = [part("streetName"), number].filter(Boolean).join(" ");
  const parts = [
    street,
    part("addressLine2"),
    part("postalCode"),
    part("city"),
    part("countrySubdivision"),
    countryName,
  ].filter(Boolean);
  return parts.join(", ");
}

interface TextOptions {
  /** Row field holding the text's tone. */
  toneField?: string;
}

/**
 * `string`: the value as written, in the tone the row gives (`toneField`) when
 * it gives one; a row without one keeps the bare value, as a string column
 * always drew it. An empty one is `null`: a cell rendering `""` as its root
 * leaves no node in the server's HTML, which the browser hydrates as a
 * mismatch, where `null` renders a placeholder both sides agree on.
 */
function renderText(
  value: CellValue,
  _locale: string,
  options?: CellOptions,
  row?: Row,
): ReturnType<DataTypeFormatter> {
  if (value === "") return null;
  const opts: TextOptions = options ?? {};
  const tone = readRowTone(row, opts.toneField);
  if (!tone) return value;

  return h("span", { class: DMS_TONE_TEXT[tone] }, [childOf(value)]);
}

export const registerPrimitiveTypes = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "number",
    formatter: { default: withNumberSuffix(formatNumber) },
    filterEditorValue: numberFilterEditorValue,
  });
  registerDataType({
    id: "string",
    formatter: { default: renderText },
  });
  registerDataType({
    id: "price",
    formatter: { default: withNumberSuffix(formatPrice) },
    filterEditorValue: numberFilterEditorValue,
  });
  registerDataType({
    id: "percentage",
    formatter: { default: withNumberSuffix(formatPercentage) },
    filterEditorValue: numberFilterEditorValue,
  });
  registerDataType({
    id: "string_time",

    formatter: {
      default: (value, locale) =>
        isNumber(value)
          ? formatDuration(Number(value), locale, { precision: "rounded" })
          : value,
    },
  });
};

const CELL_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

export const registerDateType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "date",
    formatter: {
      default: (value, locale) => {
        const { t } = getAppTranslation();
        return formatDate(value, locale) ?? t("dms.date.undefined");
      },
      cell: (value, locale) => {
        const { t } = getAppTranslation();
        return (
          formatDate(value, locale, CELL_DATE_FORMAT) ?? t("dms.date.undefined")
        );
      },
      is_between: formatDateBetween,
    },
    filterEditorValue: dateFilterEditorValue,
  });
};

export const registerBooleanType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "boolean",
    formatter: {
      default: (value, _locale) => renderBoolean(value),
      is: getBooleanLabel,
      is_not: getBooleanLabel,
    },
  });
};

export const registerAddressType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "address",
    formatter: {
      default: (value, _locale) => formatAddress(value),
    },
  });
};

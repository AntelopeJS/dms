import { type VNodeChild } from "vue";
import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { isObject } from "#dms-core/app/utils/type-check";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import { readRowTone, type Row } from "./cellHelpers";
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
  parse(String(value)) === true;

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

function dateBoundsOf(value: CellValue): [unknown, unknown] {
  const bounds: { start?: unknown; end?: unknown } = value ?? {};
  return [bounds.start, bounds.end];
}

function formatDateBetween(value: CellValue, locale: string): string {
  const { t } = getAppTranslation();
  const [rawStart, rawEnd] = Array.isArray(value) ? value : dateBoundsOf(value);
  const start = formatDate(rawStart, locale) ?? t("dms.date.undefined");
  const end = formatDate(rawEnd, locale) ?? t("dms.date.undefined");
  return `${start} - ${end}`;
}

function formatAddress(value: CellValue): string {
  if (!value || !isObject(value)) return " ";

  const { processI18n } = getAppTranslation();
  const addr = value;
  const countryName = addr.countryCode
    ? processI18n(`$country.${addr.countryCode}`)
    : addr.countryCode;
  const number = [addr.houseNumber, addr.boxNumber].filter(Boolean).join("/");
  const street = [addr.streetName, number].filter(Boolean).join(" ");
  const parts = [
    street,
    addr.addressLine2,
    addr.postalCode,
    addr.city,
    addr.countrySubdivision,
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
  const tone = readRowTone(
    row,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Text options have no runtime schema; toneField is read from the original plugin input.
    (options as TextOptions | undefined)?.toneField,
  );
  if (!tone) return value;

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- A valid tone does not validate the row value as VNodeChild; preserve the existing unchecked Vue child.
  return h("span", { class: DMS_TONE_TEXT[tone] }, [value as VNodeChild]);
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

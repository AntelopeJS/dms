import { h } from "vue";
import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import { processFieldI18n } from "../../utils/fieldOptionsI18n";
import {
  type KeyValueColumnOptions,
  keyValueColumns,
  keyValueRows,
} from "../form/keyValueRows";
import type { RepeaterTableColumn } from "../form/repeaterTable";
import { RepeaterTable } from "./defaultDisplayComponents";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";

const SECRET_TAIL = 4;
const SECRET_MASK = "••••";
const TAG_CLASS =
  "inline-flex h-5 items-center rounded-[5px] border border-default bg-elevated px-1.5 text-[11.5px]";
const TAGS_CLASS = "inline-flex flex-wrap items-center gap-1";
const CODE_CLASS = "font-mono text-[12px] truncate";
const CODE_FULL_CLASS =
  "font-mono text-[12px] wrap-anywhere whitespace-pre-wrap";

const countOf = (value: Parameters<DataTypeFormatter>[0]): number => {
  if (Array.isArray(value)) return value.length;
  if (value && isObject(value)) return Object.keys(value).length;
  return 0;
};

function renderCount(key: string) {
  return (value: Parameters<DataTypeFormatter>[0]) => {
    const { t } = getAppTranslation();
    const count = countOf(value);
    return t(key, { count }, count);
  };
}

/** The options of a field's control, with their texts in the reader's language. */
function translatedOptions<O extends object>(options: O): O {
  const { processI18n } = getAppTranslation();
  return processFieldI18n({ component: { options } }, processI18n).component
    .options;
}

const renderArrayCount = renderCount("dms.form.repeater.count");
const renderPairCount = renderCount("dms.form.key_value.count");

function isRow(
  item: Parameters<DataTypeFormatter>[0],
): item is NonNullable<Parameters<DataTypeFormatter>[3]> {
  return !!item && isObject(item);
}

function renderArrayRows(
  value: Parameters<DataTypeFormatter>[0],
  options: Parameters<DataTypeFormatter>[2],
) {
  const { columns }: { columns?: RepeaterTableColumn[] } = translatedOptions(
    options ?? {},
  );
  const rows = Array.isArray(value) ? value.filter(isRow) : [];
  if (!columns || rows.length === 0) return renderArrayCount(value);
  return h(RepeaterTable, { columns, rows });
}

function renderPairs(
  value: Parameters<DataTypeFormatter>[0],
  options: Parameters<DataTypeFormatter>[2],
) {
  const { value: valueField, ...rest }: Partial<KeyValueColumnOptions> =
    translatedOptions(options ?? {});
  if (!valueField || !value || !isObject(value) || countOf(value) === 0)
    return renderPairCount(value);
  const { t } = getAppTranslation();
  return h(RepeaterTable, {
    columns: keyValueColumns({ ...rest, value: valueField }, t),
    rows: keyValueRows(value, rest.toggleable).map((row) => ({ ...row })),
  });
}

function renderSecret(value: Parameters<DataTypeFormatter>[0]): string {
  return isString(value) && value
    ? `${SECRET_MASK}${value.slice(-SECRET_TAIL)}`
    : "";
}

function renderCode(value: Parameters<DataTypeFormatter>[0]) {
  if (!isString(value)) return "";
  const [firstLine = ""] = value.split("\n");
  return h("span", { class: CODE_CLASS, title: value }, firstLine);
}

function renderFullCode(value: Parameters<DataTypeFormatter>[0]) {
  return isString(value) ? h("pre", { class: CODE_FULL_CLASS }, value) : "";
}

function renderTags(value: Parameters<DataTypeFormatter>[0]) {
  if (!Array.isArray(value)) return "";
  return h(
    "span",
    { class: TAGS_CLASS },
    value.map((tag) => h("span", { class: TAG_CLASS }, String(tag))),
  );
}

/** The display of the array, key-value, secret, code and tags types. */
export function registerFieldTypes(
  registerDataType: (dataType: DataType) => void,
): void {
  registerDataType({
    id: "array",
    formatter: {
      default: renderArrayCount,
      full: (value, _locale, options) => renderArrayRows(value, options),
    },
  });
  registerDataType({
    id: "key_value",
    formatter: {
      default: renderPairCount,
      full: (value, _locale, options) => renderPairs(value, options),
    },
  });
  registerDataType({ id: "secret", formatter: { default: renderSecret } });
  registerDataType({
    id: "code",
    formatter: { default: renderCode, full: renderFullCode },
  });
  registerDataType({ id: "tags", formatter: { default: renderTags } });
}

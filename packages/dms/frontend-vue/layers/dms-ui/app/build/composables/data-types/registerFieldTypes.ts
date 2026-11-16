import { h } from "vue";
import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";

const SECRET_TAIL = 4;
const SECRET_MASK = "••••";
const TAG_CLASS =
  "inline-flex h-5 items-center rounded-[5px] border border-default bg-elevated px-1.5 text-[11.5px]";
const TAGS_CLASS = "inline-flex flex-wrap items-center gap-1";
const CODE_CLASS = "font-mono text-[12px] truncate";

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
    formatter: { default: renderCount("dms.form.repeater.count") },
  });
  registerDataType({
    id: "key_value",
    formatter: { default: renderCount("dms.form.key_value.count") },
  });
  registerDataType({ id: "secret", formatter: { default: renderSecret } });
  registerDataType({ id: "code", formatter: { default: renderCode } });
  registerDataType({ id: "tags", formatter: { default: renderTags } });
}

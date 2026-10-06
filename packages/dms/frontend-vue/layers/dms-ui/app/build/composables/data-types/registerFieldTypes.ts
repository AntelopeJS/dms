import { h } from "vue";
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";

// How the field types made of several values read in a table cell or a
// read-only form: a count, a masked secret, the first line of the code,
// the tags as pills.
const SECRET_TAIL = 4;
const SECRET_MASK = "••••";
const TAG_CLASS =
  "inline-flex h-5 items-center rounded-[5px] border border-default bg-elevated px-1.5 text-[11.5px]";
const TAGS_CLASS = "inline-flex flex-wrap items-center gap-1";
const CODE_CLASS = "font-mono text-[12px] truncate";

const countOf = (value: unknown): number => {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
};

function renderCount(key: string) {
  return (value: unknown) => {
    const { t } = useI18n();
    const count = countOf(value);
    return t(key, { count }, count);
  };
}

function renderSecret(value: unknown): string {
  return typeof value === "string" && value
    ? `${SECRET_MASK}${value.slice(-SECRET_TAIL)}`
    : "";
}

function renderCode(value: unknown) {
  if (typeof value !== "string") return "";
  const [firstLine = ""] = value.split("\n");
  return h("span", { class: CODE_CLASS, title: value }, firstLine);
}

function renderTags(value: unknown) {
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

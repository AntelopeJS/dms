import { isString } from "../../../../dms-core/app/utils/type-check";
import { type JsonObject, isJsonObject } from "./json";

/** An input component, with the options its field declares. */
interface ComponentWithOptions {
  options?: object;
}

/** A field whose input component carries options. */
interface FieldWithOptions {
  component: ComponentWithOptions;
}

type Translate = (key: string) => string;

const TEXT_OPTIONS = [
  "placeholder",
  "label",
  "description",
  "addLabel",
  "keyLabel",
  "valueLabel",
] as const;

const LIST_OPTIONS = ["items", "columns"] as const;
const ENTRY_TEXTS = ["label", "description"] as const;

function translateTexts(
  source: JsonObject,
  keys: readonly string[],
  processI18n: Translate,
): JsonObject {
  const translated = { ...source };
  for (const key of keys) {
    const text = Object.hasOwn(source, key) ? source[key] : undefined;
    if (isString(text)) translated[key] = processI18n(text);
  }
  return translated;
}

/**
 * An entry holding a field of its own (a repeater's column, a key-value
 * editor's value) has the options of that field's component translated too,
 * so a select inside a repeater shows its options in the reader's language.
 */
function translateNestedField(
  entry: JsonObject,
  processI18n: Translate,
): JsonObject {
  if (!isJsonObject(entry.component)) return entry;
  return {
    ...entry,
    component: translateComponent(entry.component, processI18n),
  };
}

function translateComponent<C extends ComponentWithOptions>(
  component: C,
  processI18n: Translate,
): C {
  const opts = component.options;
  if (!isJsonObject(opts)) return component;

  const options = translateTexts(opts, TEXT_OPTIONS, processI18n);
  for (const key of LIST_OPTIONS) {
    const list = Object.hasOwn(opts, key) ? opts[key] : undefined;
    if (!Array.isArray(list)) continue;
    options[key] = list.map((entry) =>
      isJsonObject(entry)
        ? translateNestedField(
            translateTexts(entry, ENTRY_TEXTS, processI18n),
            processI18n,
          )
        : entry,
    );
  }
  if (isJsonObject(opts.value)) {
    options.value = translateNestedField(opts.value, processI18n);
  }

  return { ...component, options };
}

/**
 * A field with the texts of its input component's options translated
 * (`$`-prefixed i18n keys): placeholder, labels, descriptions, and those of
 * its options and columns, the way forms show them. The fields nested in it
 * (a repeater's columns, a key-value editor's value) are translated the same
 * way, at any depth.
 */
export function processFieldI18n<F extends FieldWithOptions>(
  field: F,
  processI18n: Translate,
): F {
  if (!field.component.options) return field;
  return {
    ...field,
    component: translateComponent(field.component, processI18n),
  };
}

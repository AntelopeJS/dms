/** An input component, with the options its field declares. */
interface ComponentWithOptions {
  options?: object;
}

/** A field whose input component carries options. */
interface FieldWithOptions {
  component: ComponentWithOptions;
}

type Translate = (key: string) => string;
type Options = Record<string, unknown>;

// Texts of an input component's options a reader sees: its placeholder, the
// text beside a switch, a repeater's button and headers…
const TEXT_OPTIONS = [
  "placeholder",
  "label",
  "description",
  "addLabel",
  "keyLabel",
  "valueLabel",
] as const;
// …and those of the entries of its lists: the options of a select, the
// columns of a repeater.
const LIST_OPTIONS = ["items", "columns"] as const;
const ENTRY_TEXTS = ["label", "description"] as const;

const isText = (value: unknown): value is string => typeof value === "string";

const isOptions = (value: unknown): value is Options =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function translateTexts(
  source: Options,
  keys: readonly string[],
  processI18n: Translate,
): Options {
  const translated: Options = { ...source };
  for (const key of keys) {
    if (isText(source[key])) translated[key] = processI18n(source[key]);
  }
  return translated;
}

/**
 * An entry holding a field of its own (a repeater's column, a key-value
 * editor's value) has the options of that field's component translated too,
 * so a select inside a repeater shows its options in the reader's language.
 */
function translateNestedField(entry: Options, processI18n: Translate): Options {
  if (!isOptions(entry.component)) return entry;
  return {
    ...entry,
    component: translateComponent(entry.component, processI18n),
  };
}

function translateComponent<C extends ComponentWithOptions>(
  component: C,
  processI18n: Translate,
): C {
  const opts = component.options as Options | undefined;
  if (!opts) return component;

  const options = translateTexts(opts, TEXT_OPTIONS, processI18n);
  for (const key of LIST_OPTIONS) {
    const list = opts[key];
    if (!Array.isArray(list)) continue;
    options[key] = list.map((entry: Options) =>
      translateNestedField(
        translateTexts(entry, ENTRY_TEXTS, processI18n),
        processI18n,
      ),
    );
  }
  if (isOptions(opts.value)) {
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

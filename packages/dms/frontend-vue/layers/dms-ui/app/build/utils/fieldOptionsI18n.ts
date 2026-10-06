/** A field whose input component carries options. */
interface FieldWithOptions {
  component: { options?: object };
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
 * A field with the texts of its input component's options translated
 * (`$`-prefixed i18n keys): placeholder, labels, descriptions, and those of
 * its options and columns, the way forms show them.
 */
export function processFieldI18n<F extends FieldWithOptions>(
  field: F,
  processI18n: Translate,
): F {
  const opts = field.component.options as Options | undefined;
  if (!opts) return field;

  const options = translateTexts(opts, TEXT_OPTIONS, processI18n);
  for (const key of LIST_OPTIONS) {
    const list = opts[key];
    if (!Array.isArray(list)) continue;
    options[key] = list.map((entry: Options) =>
      translateTexts(entry, ENTRY_TEXTS, processI18n),
    );
  }

  return { ...field, component: { ...field.component, options } };
}

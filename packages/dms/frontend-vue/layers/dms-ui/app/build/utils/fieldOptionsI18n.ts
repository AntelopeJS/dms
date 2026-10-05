/** The options of a field's input component a reader sees translated. */
interface TranslatableFieldOptions {
  placeholder?: unknown;
  items?: unknown;
}

/** A field whose input component carries options. */
interface FieldWithOptions {
  component: { options?: object };
}

const isText = (value: unknown): value is string => typeof value === "string";

/**
 * A field with the placeholder and the item labels of its input component
 * translated (`$`-prefixed i18n keys), the way forms show them.
 */
export function processFieldI18n<F extends FieldWithOptions>(
  field: F,
  processI18n: (key: string) => string,
): F {
  const opts = field.component.options as TranslatableFieldOptions | undefined;
  if (!opts) return field;

  const placeholder = isText(opts.placeholder)
    ? processI18n(opts.placeholder)
    : undefined;

  const items = Array.isArray(opts.items)
    ? (opts.items as { label?: unknown }[]).map((item) => ({
        ...item,
        label: isText(item.label) ? processI18n(item.label) : item.label,
      }))
    : opts.items;

  return {
    ...field,
    component: { ...field.component, options: { ...opts, placeholder, items } },
  };
}

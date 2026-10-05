/** The forms a table view opens: add (`new`), edit and details (`view`). */
export type TableViewFormKind = "new" | "edit" | "view";

/** Heading texts of one form (a backend `formContainer.pages` entry). */
export interface TableViewFormText {
  displayName?: string;
  description?: string;
}

/** The backend `formContainer.pages`: the texts of each form. */
export interface TableViewFormPages {
  new?: TableViewFormText;
  edit?: TableViewFormText;
  details?: TableViewFormText;
}

/** The `formContainer.pages` key of each form kind. */
const FORM_PAGE_KEYS: Record<TableViewFormKind, keyof TableViewFormPages> = {
  new: "new",
  edit: "edit",
  view: "details",
};

/** Separates the form title from the label of the row it is about. */
export const RECORD_LABEL_SEPARATOR = " · ";

interface FallbackKeys {
  title: string;
  description: string;
  /** The description naming the table's caption (`{caption}`). */
  captionDescription: string;
}

const FALLBACK_KEYS: Record<TableViewFormKind, FallbackKeys> = {
  new: {
    title: "dms.table.new_item",
    description: "dms.table.new_item_description",
    captionDescription: "dms.table.new_item_in",
  },
  edit: {
    title: "dms.table.edit_item",
    description: "dms.table.edit_item_description",
    captionDescription: "dms.table.edit_item_in",
  },
  view: {
    title: "dms.table.view_item",
    description: "dms.table.view_item_description",
    captionDescription: "dms.table.view_item_in",
  },
};

export interface FormContainerTextSource {
  kind: TableViewFormKind;
  /** The table view's `formContainer.pages`. */
  pages?: TableViewFormPages;
  /** The table's caption, `$`-prefixed when an i18n key. */
  caption?: string;
  /** The row's label (its `labelKey` value), for the edit and details forms. */
  recordLabel?: unknown;
  /** The reader's locale, to read a localized label in. */
  locale?: string;
}

export interface FormContainerTexts {
  title: string;
  description: string;
}

/**
 * Title and description of the drawer or modal a table view opens a form in:
 * the table's `formContainer.pages` entry, else "New entry" / "Edit entry" /
 * "Entry details" with a description naming the caption. The row's label
 * follows the title ("Edit task · Write the docs").
 */
export function resolveFormContainerTexts(
  source: FormContainerTextSource,
  resolve: (text: string) => string,
  t: (key: string, params?: Record<string, unknown>) => string,
): FormContainerTexts {
  const keys = FALLBACK_KEYS[source.kind];
  const texts = source.pages?.[FORM_PAGE_KEYS[source.kind]];
  const caption = source.caption ? resolve(source.caption) : "";

  const title = texts?.displayName ? resolve(texts.displayName) : t(keys.title);
  const label = formatRecordLabel(source.recordLabel, source.locale);
  let description: string;
  if (texts?.description) {
    description = resolve(texts.description);
  } else if (caption) {
    description = t(keys.captionDescription, { caption });
  } else {
    description = t(keys.description);
  }

  return {
    title: label ? `${title}${RECORD_LABEL_SEPARATOR}${label}` : title,
    description,
  };
}

/**
 * A row label worth showing: a non-empty string or number. A localized value
 * (`{ en: "Task 1", fr: "Tâche 1" }`, as a form loads it) gives its text in
 * `locale`, its language, or else its first text.
 */
export function formatRecordLabel(
  value: unknown,
  locale?: string,
): string | undefined {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const texts = value as Record<string, unknown>;
  const candidates = [
    locale ? texts[locale] : undefined,
    locale ? texts[locale.split("-")[0]!] : undefined,
    ...Object.values(texts),
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const label = candidate.trim();
    if (label) return label;
  }
  return undefined;
}

import type { UserNotification } from "./useNotifications";

/** The read-state switch of the inbox. */
export type InboxReadState = "all" | "unread" | "read";

/** The inbox filters as the page keeps them, and as its URL holds them. */
export interface InboxFilters {
  /** The search as typed. */
  q: string;
  /** A category id, or "" for every category. */
  category: string;
  /** A subject id of `category`, or "" for the whole category. */
  subject: string;
  status: InboxReadState;
}

/** The inbox filter the API takes: the search comes with its matching keys. */
export interface InboxApiFilter {
  q: string;
  /** Message keys (without `$`) whose translation contains `q`. */
  keys: string[];
  category: string;
  subject: string;
  status: InboxReadState;
}

/** Longest search sent to the API (its own cap). */
export const INBOX_SEARCH_MAX_LENGTH = 100;
/** Most message keys sent with one search (the API's cap). */
export const INBOX_SEARCH_MAX_KEYS = 200;
/** Budget of the `keys` parameter, so the request line stays short. */
export const INBOX_KEYS_MAX_CHARACTERS = 6000;
/** The category select's "every category" value (a select item needs one). */
export const ALL_CATEGORIES_VALUE = "all";

const READ_STATES: readonly InboxReadState[] = ["all", "unread", "read"];
const SUBJECT_SEPARATOR = ":";
const KEY_PREFIX = "$";
const PLURAL_SEPARATOR = /\s\|\s/;
const PLACEHOLDER = /\{[^{}]*\}/g;
const WHITESPACE_RUN = /\s+/g;
const DIACRITICS = /\p{M}/gu;
const ID_PATTERN = /^[\w.:-]{1,100}$/;

/** URL query keys of the inbox filters. */
export const INBOX_QUERY_KEYS = {
  q: "q",
  category: "category",
  subject: "subject",
  status: "status",
} as const;

export const DEFAULT_INBOX_FILTERS: Readonly<InboxFilters> = Object.freeze({
  q: "",
  category: "",
  subject: "",
  status: "all",
});

const firstString = (value: unknown): string => {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : "";
};

const readId = (value: unknown): string => {
  const id = firstString(value);
  return ID_PATTERN.test(id) ? id : "";
};

const isReadState = (value: string): value is InboxReadState =>
  (READ_STATES as readonly string[]).includes(value);

/** Collapses the whitespace of a search and caps its length. */
export const cleanSearch = (text: string): string =>
  text.replace(WHITESPACE_RUN, " ").trim().slice(0, INBOX_SEARCH_MAX_LENGTH);

/**
 * Reads the filters from a page query; unknown or malformed values fall back
 * to their default, and a subject needs its category.
 */
export const readInboxFilters = (
  query: Record<string, unknown>,
): InboxFilters => {
  const status = firstString(query[INBOX_QUERY_KEYS.status]);
  const category = readId(query[INBOX_QUERY_KEYS.category]);
  return {
    q: cleanSearch(firstString(query[INBOX_QUERY_KEYS.q])),
    category,
    subject: category ? readId(query[INBOX_QUERY_KEYS.subject]) : "",
    status: isReadState(status) ? status : "all",
  };
};

/**
 * Writes the filters into URL search params, leaving defaults out so a
 * clean inbox keeps a clean URL. Other params are kept.
 */
export const writeInboxFilters = (
  params: URLSearchParams,
  filters: InboxFilters,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  const values: Record<keyof InboxFilters, string> = {
    q: cleanSearch(filters.q),
    category: filters.category,
    subject: filters.category ? filters.subject : "",
    status: filters.status === "all" ? "" : filters.status,
  };
  for (const field of Object.keys(values) as (keyof InboxFilters)[]) {
    const key = INBOX_QUERY_KEYS[field];
    if (values[field]) next.set(key, values[field]);
    else next.delete(key);
  }
  return next;
};

/** The page URL with the filters written into its query. */
export const buildInboxUrl = (
  location: Pick<Location, "pathname" | "search" | "hash">,
  filters: InboxFilters,
): string => {
  const query = writeInboxFilters(
    new URLSearchParams(location.search),
    filters,
  ).toString();
  return `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
};

/** Whether the search, category or subject narrow the inbox. */
export const isNarrowedInbox = (
  filters: Pick<InboxFilters, "q" | "category">,
): boolean => !!(cleanSearch(filters.q) || filters.category);

/** Whether any filter, the read state included, is on. */
export const hasActiveInboxFilters = (filters: InboxFilters): boolean =>
  isNarrowedInbox(filters) || filters.status !== "all";

/** The category select's value for a category and subject. */
export const toCategoryValue = (category: string, subject: string): string => {
  if (!category) return ALL_CATEGORIES_VALUE;
  return subject ? `${category}${SUBJECT_SEPARATOR}${subject}` : category;
};

/** The category and subject a category select value names. */
export const fromCategoryValue = (
  value: string,
): Pick<InboxFilters, "category" | "subject"> => {
  if (!value || value === ALL_CATEGORIES_VALUE)
    return { category: "", subject: "" };
  const separator = value.indexOf(SUBJECT_SEPARATOR);
  if (separator === -1) return { category: value, subject: "" };
  return {
    category: value.slice(0, separator),
    subject: value.slice(separator + 1),
  };
};

/** Lower case, without accents or extra spaces: "Sécurité " → "securite". */
export const normalizeSearchText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLocaleLowerCase()
    .replace(WHITESPACE_RUN, " ")
    .trim();

/**
 * The message keys whose translation contains the search, case and accents
 * aside. `translate` returns the texts a key reads as (a plural message has
 * several), with its placeholders left empty; a key it returns unchanged has
 * no translation and is skipped. Capped to what the API takes.
 */
export const matchMessageKeys = (
  keys: readonly string[],
  translate: (key: string) => string[],
  search: string,
): string[] => {
  const needle = normalizeSearchText(search);
  if (!needle) return [];
  const matches: string[] = [];
  let characters = 0;
  for (const key of keys) {
    const texts = translate(key).filter((text) => text && text !== key);
    const isMatch = texts.some((text) =>
      text
        .split(PLURAL_SEPARATOR)
        .some((choice) =>
          normalizeSearchText(choice.replace(PLACEHOLDER, " ")).includes(
            needle,
          ),
        ),
    );
    if (!isMatch) continue;
    characters += key.length + 1;
    if (
      matches.length >= INBOX_SEARCH_MAX_KEYS ||
      characters > INBOX_KEYS_MAX_CHARACTERS
    )
      break;
    matches.push(key);
  }
  return matches;
};

/**
 * The API query params of a filter. `withStatus` adds the read state: the
 * list and the bulk actions take it, the tab counts do not.
 */
export const inboxApiParams = (
  filter: InboxApiFilter,
  withStatus: boolean,
): URLSearchParams => {
  const params = new URLSearchParams();
  const q = cleanSearch(filter.q);
  if (q) {
    params.set("q", q);
    if (filter.keys.length > 0) params.set("keys", filter.keys.join(","));
  }
  if (filter.category) {
    params.set("category", filter.category);
    if (filter.subject) params.set("subject", filter.subject);
  }
  if (withStatus && filter.status !== "all")
    params.set("filter", filter.status);
  return params;
};

const rawText = (value: string | null | undefined): string =>
  value && !value.startsWith(KEY_PREFIX) ? value : "";

const storedKey = (value: string | null | undefined): string =>
  value?.startsWith(KEY_PREFIX) ? value.slice(KEY_PREFIX.length) : "";

/**
 * Whether a notification matches the search, the way the API matches it: a
 * raw title or description containing it, a message key in `keys`, or a
 * param value containing it (case aside).
 */
export const matchesInboxSearch = (
  notification: Pick<UserNotification, "title" | "description" | "params">,
  filter: Pick<InboxApiFilter, "q" | "keys">,
): boolean => {
  const needle = cleanSearch(filter.q).toLocaleLowerCase();
  if (!needle) return true;
  const keys = new Set(filter.keys);
  const { title, description, params } = notification;
  return (
    [rawText(title), rawText(description)].some((text) =>
      text.toLocaleLowerCase().includes(needle),
    ) ||
    [storedKey(title), storedKey(description)].some(
      (key) => !!key && keys.has(key),
    ) ||
    Object.values(params ?? {}).some((value) =>
      String(value).toLocaleLowerCase().includes(needle),
    )
  );
};

/**
 * Whether a notification belongs to the filtered feed. `withStatus` checks
 * the read state too: the tab counts follow the search and category only.
 */
export const matchesInboxFilter = (
  notification: Pick<
    UserNotification,
    "title" | "description" | "params" | "categoryId" | "subjectId" | "isRead"
  >,
  filter: InboxApiFilter,
  withStatus: boolean,
): boolean => {
  if (filter.category && notification.categoryId !== filter.category)
    return false;
  if (filter.subject && notification.subjectId !== filter.subject) return false;
  if (withStatus && filter.status !== "all") {
    if (notification.isRead !== (filter.status === "read")) return false;
  }
  return matchesInboxSearch(notification, filter);
};

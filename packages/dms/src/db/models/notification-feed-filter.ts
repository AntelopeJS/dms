import {
  ValueProxy,
  type ValueProxyOrValue,
} from "@antelopejs/interface-database";
import type { UserNotification } from "../tables";

/** Longest search the inbox accepts, in characters. */
export const FEED_SEARCH_MAX_LENGTH = 100;
/** Most message keys one search may name. */
export const FEED_SEARCH_MAX_KEYS = 200;
/** Longest message key a search may name. */
export const FEED_SEARCH_MAX_KEY_LENGTH = 200;

const READ_STATES = ["unread", "read"] as const;
// The unfiltered tab, which older clients may name.
const ALL_READ_STATES = "all";
const KEY_LIST_SEPARATOR = ",";
// What a stored title or description starts with when it is a message key.
const MESSAGE_KEY_MARKER = "$";
// A message key without its `$` marker, as `dms.notifications.messages.x.title`.
const MESSAGE_KEY_PATTERN = /^[\w.-]+$/;
// Category and subject ids.
const ID_PATTERN = /^[\w.:-]{1,100}$/;
const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\/-]/g;
const WHITESPACE_RUN = /\s+/g;
// A UUID's first groups, or a whole number of ten digits or more.
const MACHINE_VALUE = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-|\d{10,}$`;

export type NotificationReadState = (typeof READ_STATES)[number];

/** What the user typed, and the message keys whose translation matches it. */
export interface NotificationFeedSearch {
  text: string;
  keys: string[];
}

/** Narrows a user's feed; an empty filter keeps every visible row. */
export interface NotificationFeedFilter {
  readState?: NotificationReadState;
  categoryId?: string;
  subjectId?: string;
  search?: NotificationFeedSearch;
}

/** The inbox query parameters as they come in, all optional. */
export interface NotificationFeedQuery {
  q?: string;
  keys?: string;
  category?: string;
  subject?: string;
  filter?: string;
}

function isReadState(value: string): value is NotificationReadState {
  return (READ_STATES as readonly string[]).includes(value);
}

function parseKeys(raw: string | undefined): string[] | undefined {
  if (!raw) return [];
  const keys = [
    ...new Set(
      raw
        .split(KEY_LIST_SEPARATOR)
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];
  const isValid =
    keys.length <= FEED_SEARCH_MAX_KEYS &&
    keys.every(
      (key) =>
        key.length <= FEED_SEARCH_MAX_KEY_LENGTH &&
        MESSAGE_KEY_PATTERN.test(key),
    );
  return isValid ? keys : undefined;
}

function parseSearch(
  query: NotificationFeedQuery,
): NotificationFeedSearch | null | undefined {
  const text = (query.q ?? "").replace(WHITESPACE_RUN, " ").trim();
  if (text.length > FEED_SEARCH_MAX_LENGTH) return undefined;
  const keys = parseKeys(query.keys);
  if (!keys) return undefined;
  return text ? { text, keys } : null;
}

/**
 * Reads the inbox query parameters into a filter. Returns undefined when a
 * parameter is malformed or over its cap: a search longer than
 * {@link FEED_SEARCH_MAX_LENGTH}, more than {@link FEED_SEARCH_MAX_KEYS}
 * keys, an unknown read state, or a subject without its category. Keys
 * without a search are ignored: they only widen what a search matches.
 */
export function parseNotificationFeedQuery(
  query: NotificationFeedQuery,
): NotificationFeedFilter | undefined {
  const filter: NotificationFeedFilter = {};

  if (query.filter && query.filter !== ALL_READ_STATES) {
    if (!isReadState(query.filter)) return undefined;
    filter.readState = query.filter;
  }
  if (query.category) {
    if (!ID_PATTERN.test(query.category)) return undefined;
    filter.categoryId = query.category;
  }
  if (query.subject) {
    if (!filter.categoryId || !ID_PATTERN.test(query.subject)) return undefined;
    filter.subjectId = query.subject;
  }

  const search = parseSearch(query);
  if (search === undefined) return undefined;
  if (search) filter.search = search;
  return filter;
}

/** Whether the filter narrows the feed beyond its read state. */
export function isNarrowedFeed(filter: NotificationFeedFilter): boolean {
  return !!(filter.categoryId || filter.search);
}

/** Whether the filter narrows the feed at all. */
export function isFilteredFeed(filter: NotificationFeedFilter): boolean {
  return isNarrowedFeed(filter) || !!filter.readState;
}

export function escapeRegex(text: string): string {
  return text.replace(REGEX_SPECIAL_CHARACTERS, "\\$&");
}

/**
 * Case-insensitive "contains" over a param value (a name, an email, a
 * device). Machine values no one reads are skipped: ids (UUIDs) and time
 * stamps (ten digits or more).
 */
export function paramValuePattern(text: string): string {
  return `(?i)^(?!${MACHINE_VALUE})[\\s\\S]*?${escapeRegex(text)}`;
}

/**
 * Case-insensitive "contains" over a raw title or description. A value
 * starting with `$` is a message key, never what the user reads: it is
 * matched through {@link messageKeysPattern} instead.
 */
export function rawTextPattern(text: string): string {
  return `(?i)^(?![$])[\\s\\S]*?${escapeRegex(text)}`;
}

/** The stored values (`$key`) of the message keys `keys`. */
export function messageKeyValues(keys: string[]): string[] {
  return keys.map((key) => `${MESSAGE_KEY_MARKER}${key}`);
}

type NotificationRow = ValueProxy<UserNotification>;
type ParamValues = Record<string, string | number>;

function textField(
  row: NotificationRow,
  field: "title" | "description",
): ValueProxy<string> {
  return row.key(field).default("").cast<string>();
}

/** Whether a param value (a name, an email, a device) contains the search. */
function paramsContain(
  row: NotificationRow,
  pattern: string,
): ValueProxy<boolean> {
  return row
    .key("params")
    .default({})
    .cast<ParamValues>()
    .values()
    .filter((value) =>
      // `downcase` turns a number into its digits, which `match` needs.
      value.cast<string>().downcase().match(pattern),
    )
    .isempty()
    .not();
}

/**
 * The search as one condition: a raw title or description containing the
 * text, a message key whose translation matched on the client, or a param
 * value containing the text.
 */
export function searchCondition(
  row: NotificationRow,
  search: NotificationFeedSearch,
): ValueProxy<boolean> {
  const raw = rawTextPattern(search.text);
  let condition = textField(row, "title")
    .match(raw)
    .or(textField(row, "description").match(raw))
    .or(paramsContain(row, paramValuePattern(search.text)));

  if (search.keys.length > 0) {
    const keys = ValueProxy.constant(messageKeyValues(search.keys));
    condition = condition
      .or(keys.includes(textField(row, "title")))
      .or(keys.includes(textField(row, "description")));
  }
  return condition;
}

interface FilterableFeed<Q> {
  filter(predicate: (row: NotificationRow) => ValueProxyOrValue<boolean>): Q;
}

/**
 * Narrows a feed query (already restricted to one user through the user
 * index) to the rows the filter keeps.
 */
export function applyFeedFilter<Q extends FilterableFeed<Q>>(
  feed: Q,
  filter: NotificationFeedFilter,
): Q {
  let query = feed;
  const { readState, categoryId, subjectId, search } = filter;

  if (readState) {
    const isRead = readState === "read";
    query = query.filter((row) => row.key("isRead").eq(isRead));
  }
  if (categoryId) {
    query = query.filter((row) => row.key("categoryId").eq(categoryId));
  }
  if (subjectId) {
    query = query.filter((row) => row.key("subjectId").eq(subjectId));
  }
  if (search) {
    query = query.filter((row) => searchCondition(row, search));
  }
  return query;
}

/**
 * Narrows a feed (the unread rows of one user) to what the header bell
 * counts as new: the rows created after the user last opened it. Without a
 * date, the bell has never opened and every one of them counts.
 */
export function applyUnseenFilter<Q extends FilterableFeed<Q>>(
  feed: Q,
  seenAt?: Date,
): Q {
  return seenAt ? feed.filter((row) => row.key("createdAt").gt(seenAt)) : feed;
}

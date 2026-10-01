/** `h23`: 24-hour clock (14:05); `h12`: 12-hour clock (2:05 PM). */
export type TimeFormatPreference = "h23" | "h12";

/** `numeric`: 01/10/2026; `text`: the month as a word (1 Oct 2026). */
export type DateFormatPreference = "numeric" | "text";

/** First day of the week: 0 Sunday, 1 Monday, 6 Saturday. */
export type WeekStartPreference = 0 | 1 | 6;

/**
 * How the signed-in user wants dates and times written. An unset field is
 * automatic: the browser's time zone, the language's week and clock, and each
 * screen's own date format.
 */
export interface RegionalPreferences {
  timeZone?: string;
  weekStart?: WeekStartPreference;
  timeFormat?: TimeFormatPreference;
  dateFormat?: DateFormatPreference;
}

/** The regional fields as the session user carries them. */
export interface RegionalPreferenceFields {
  timeZone?: unknown;
  weekStart?: unknown;
  timeFormat?: unknown;
  dateFormat?: unknown;
}

export interface RegionalOptionsSettings {
  /**
   * Keep the browser's time zone. For values that are calendar days computed
   * in the browser (a date picker's day, a period's bounds): moving them to
   * another zone would show the day before or after.
   */
  keepLocalZone?: boolean;
}

type PreferencesSource = () => RegionalPreferences;

const WEEK_STARTS: readonly number[] = [0, 1, 6];
const TIME_FORMATS: readonly string[] = ["h23", "h12"];
const DATE_FORMATS: readonly string[] = ["numeric", "text"];
const TEXT_MONTHS: readonly string[] = ["long", "short", "narrow"];
const NUMERIC_MONTHS: readonly string[] = ["numeric", "2-digit"];
const DAY_MS = 24 * 60 * 60 * 1000;
const MONDAY = 1;
const DAYS_PER_WEEK = 7;

/** `timeStyle` as the fields it stands for, when a date format replaces `dateStyle`. */
const TIME_STYLE_FIELDS: Record<string, Intl.DateTimeFormatOptions> = {
  full: { hour: "2-digit", minute: "2-digit", second: "2-digit" },
  long: { hour: "2-digit", minute: "2-digit", second: "2-digit" },
  medium: { hour: "2-digit", minute: "2-digit", second: "2-digit" },
  short: { hour: "2-digit", minute: "2-digit" },
};

const NUMERIC_DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const knownTimeZones = new Map<string, boolean>();
let preferencesSource: PreferencesSource | undefined;

/** Whether the runtime knows `timeZone` (an unknown one would throw in Intl). */
export function isKnownTimeZone(timeZone: string): boolean {
  const known = knownTimeZones.get(timeZone);
  if (known !== undefined) return known;
  let isKnown = true;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    isKnown = false;
  }
  knownTimeZones.set(timeZone, isKnown);
  return isKnown;
}

/** The time zone the browser (or the server, while rendering) runs in. */
export function browserTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const pickFrom = <T>(allowed: readonly unknown[], value: unknown) =>
  allowed.includes(value) ? (value as T) : undefined;

/**
 * Keeps the regional preferences of a session user that this runtime can
 * apply, so a stale or hand-edited value never makes a date throw.
 */
export function readRegionalPreferences(
  fields: RegionalPreferenceFields | null | undefined,
): RegionalPreferences {
  if (!fields) return {};
  const timeZone =
    typeof fields.timeZone === "string" && isKnownTimeZone(fields.timeZone)
      ? fields.timeZone
      : undefined;
  return {
    timeZone,
    weekStart: pickFrom<WeekStartPreference>(WEEK_STARTS, fields.weekStart),
    timeFormat: pickFrom<TimeFormatPreference>(TIME_FORMATS, fields.timeFormat),
    dateFormat: pickFrom<DateFormatPreference>(DATE_FORMATS, fields.dateFormat),
  };
}

/**
 * Tells the shared formatters where to read the current user's preferences.
 * The source is called on every format, so on the server it resolves the
 * request being rendered rather than a value captured once.
 */
export function setRegionalPreferencesSource(source: PreferencesSource): void {
  preferencesSource = source;
}

/** The current user's preferences; none outside an application. */
export function currentRegionalPreferences(): RegionalPreferences {
  try {
    return preferencesSource?.() ?? {};
  } catch {
    return {};
  }
}

const hasTime = (options: Intl.DateTimeFormatOptions): boolean =>
  options.hour !== undefined || options.timeStyle !== undefined;

const isFullDate = (options: Intl.DateTimeFormatOptions): boolean =>
  options.day !== undefined &&
  options.year !== undefined &&
  options.weekday === undefined;

function toNumericDate(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (options.dateStyle && options.dateStyle !== "short") {
    const { dateStyle: _dateStyle, timeStyle, ...rest } = options;
    return {
      ...rest,
      ...NUMERIC_DATE,
      ...(timeStyle ? TIME_STYLE_FIELDS[timeStyle] : {}),
    };
  }
  if (isFullDate(options) && TEXT_MONTHS.includes(options.month ?? "")) {
    return { ...options, ...NUMERIC_DATE };
  }
  return options;
}

function toTextDate(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (options.dateStyle === "short") return { ...options, dateStyle: "medium" };
  if (isFullDate(options) && NUMERIC_MONTHS.includes(options.month ?? "")) {
    return { ...options, month: "short" };
  }
  return options;
}

const DATE_FORMAT_REWRITES: Record<
  DateFormatPreference,
  (options: Intl.DateTimeFormatOptions) => Intl.DateTimeFormatOptions
> = {
  numeric: toNumericDate,
  text: toTextDate,
};

/**
 * Adds the user's preferences to a set of `Intl.DateTimeFormat` options. What
 * the caller states explicitly wins: a given `timeZone`, `hour12` or
 * `hourCycle` is kept. The date format only rewrites full dates (day, month
 * and year), never a "Sep 27" or a weekday.
 *
 * @param options What the screen asks for
 * @param settings `keepLocalZone` for calendar days computed in the browser
 * @param preferences Defaults to the current user's
 */
export function withRegionalOptions(
  options: Intl.DateTimeFormatOptions,
  settings: RegionalOptionsSettings = {},
  preferences: RegionalPreferences = currentRegionalPreferences(),
): Intl.DateTimeFormatOptions {
  let result = preferences.dateFormat
    ? DATE_FORMAT_REWRITES[preferences.dateFormat](options)
    : { ...options };
  if (preferences.timeZone && !settings.keepLocalZone && !result.timeZone) {
    result = { ...result, timeZone: preferences.timeZone };
  }
  const statesClock =
    result.hour12 !== undefined || result.hourCycle !== undefined;
  if (preferences.timeFormat && hasTime(result) && !statesClock) {
    result = { ...result, hourCycle: preferences.timeFormat };
  }
  return result;
}

/** `new Intl.DateTimeFormat` with the user's preferences applied. */
export function regionalDateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  settings?: RegionalOptionsSettings,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(
    locale,
    withRegionalOptions(options, settings),
  );
}

/**
 * The calendar day `date` falls on in the user's time zone, as a day count
 * since the epoch: two dates share a day when their numbers are equal, and
 * the difference of two numbers is the number of days between them.
 */
export function regionalDayNumber(
  date: Date,
  preferences: RegionalPreferences = currentRegionalPreferences(),
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: preferences.timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(read("year"), read("month") - 1, read("day")) / DAY_MS;
}

/** `YYYY-MM-DD` of the day `date` falls on in the user's time zone. */
export function regionalDayKey(date: Date): string {
  return new Date(regionalDayNumber(date) * DAY_MS).toISOString().slice(0, 10);
}

interface WeekInfo {
  firstDay: number;
}

type LocaleWithWeekInfo = Intl.Locale & {
  getWeekInfo?: () => WeekInfo;
  weekInfo?: WeekInfo;
};

/**
 * First day of the week of a locale (0 = Sunday … 6 = Saturday). A locale
 * with a region answers for itself where the runtime exposes week data; a
 * bare language tag ("en", "fr") stands for the DMS locales, en-GB and
 * fr-FR, which both start on Monday.
 */
export function localeWeekStart(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as LocaleWithWeekInfo;
    if (!info.region) return MONDAY;
    const weekInfo = info.getWeekInfo?.() ?? info.weekInfo;
    if (weekInfo) return weekInfo.firstDay % DAYS_PER_WEEK;
  } catch {
    // An unknown tag falls back to Monday.
  }
  return MONDAY;
}

/** The user's first day of the week, else the locale's. */
export function regionalWeekStart(
  locale: string,
  preferences: RegionalPreferences = currentRegionalPreferences(),
): number {
  return preferences.weekStart ?? localeWeekStart(locale);
}

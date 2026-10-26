// Dates and times of the agenda written in the reader's locale, in the zone
// the agenda draws in, on the reader's clock (12 or 24 h).

import { computed } from "vue";
import type {
  AgendaDayKey,
  AgendaFormat,
  AgendaRange,
  ResolvedAgendaView,
} from "./agendaModel";
import { parseDayKey } from "./agendaTime";

/** The day styles `AgendaFormat.day` writes. */
export type AgendaDayStyle =
  | "short"
  | "medium"
  | "long"
  | "weekday"
  | "weekdayShort";

const DAY_STYLES: Record<AgendaDayStyle, Intl.DateTimeFormatOptions> = {
  short: { weekday: "short", day: "numeric" },
  medium: { weekday: "short", day: "numeric", month: "short" },
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  weekday: { weekday: "long" },
  weekdayShort: { weekday: "short" },
};

const MINUTES_PER_HOUR = 60;
const UTC = "UTC";
const formatters = new Map<string, Intl.DateTimeFormat>();
/** Thin, narrow no-break and no-break spaces, which ICU versions use differently. */
const SPACES = /[\u00a0\u2009\u202f]/g;

/**
 * A formatted text with plain spaces: Node's ICU and a browser's put thin
 * or narrow spaces in different places (around a range's dash, before
 * "AM"), and a server render must read as the browser's.
 */
export function plainSpaces(text: string): string {
  return text.replace(SPACES, " ");
}

function formatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
}

/** A day key as a date at noon UTC: written in UTC, it is that day anywhere. */
const dayDate = (key: AgendaDayKey) => {
  const { year, month, day } = parseDayKey(key);
  return new Date(Date.UTC(year, month - 1, day, 12));
};

/** What the formats are written with. */
export interface AgendaFormatSettings {
  locale: string;
  timeZone: string;
  /** `h12` for a 12-hour clock. */
  hourCycle: "h12" | "h23";
}

/** A time of day ("09:30", "9:30 AM"). */
export function formatAgendaTime(
  epoch: number,
  settings: AgendaFormatSettings,
): string {
  const twelve = settings.hourCycle === "h12";
  const text = formatter(settings.locale, {
    timeZone: settings.timeZone,
    hour: twelve ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle: settings.hourCycle,
  }).format(epoch);
  return plainSpaces(text);
}

/** "09:30 – 10:15", or the start alone. */
export function formatAgendaTimeRange(
  start: number,
  end: number | undefined,
  settings: AgendaFormatSettings,
): string {
  const from = formatAgendaTime(start, settings);
  return end === undefined
    ? from
    : `${from} – ${formatAgendaTime(end, settings)}`;
}

/** A day in one of the styles ("Mon 28", "Monday 28 September 2026"). */
export function formatAgendaDay(
  key: AgendaDayKey,
  style: AgendaDayStyle,
  locale: string,
): string {
  return plainSpaces(
    formatter(locale, { ...DAY_STYLES[style], timeZone: UTC }).format(
      dayDate(key),
    ),
  );
}

/** "September 2026" (`month` 0–11). */
export function formatAgendaMonth(
  year: number,
  month: number,
  locale: string,
): string {
  return plainSpaces(
    formatter(locale, {
      month: "long",
      year: "numeric",
      timeZone: UTC,
    }).format(new Date(Date.UTC(year, month, 1, 12))),
  );
}

/** Two days as one span ("28 Sep – 4 Oct 2026", "19–25 Oct 2026"). */
export function formatAgendaDaySpan(
  from: AgendaDayKey,
  to: AgendaDayKey,
  locale: string,
): string {
  const span = formatter(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: UTC,
  });
  if (from === to) return plainSpaces(span.format(dayDate(from)));
  return plainSpaces(span.formatRange(dayDate(from), dayDate(to)));
}

/** The toolbar's period for a view's range around its anchor. */
export function formatAgendaPeriod(
  view: ResolvedAgendaView,
  range: AgendaRange,
  anchor: AgendaDayKey,
  locale: string,
): string {
  const { year, month } = parseDayKey(anchor);
  if (view.type === "month") return formatAgendaMonth(year, month - 1, locale);
  if (view.type === "year") return String(year);
  if (view.type === "day") return formatAgendaDay(range.from, "long", locale);
  return formatAgendaDaySpan(range.from, range.to, locale);
}

/** A length of time ("45 min", "2 h", "1 h 30"). */
export function formatAgendaDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / MINUTES_PER_HOUR);
  const rest = whole % MINUTES_PER_HOUR;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** What `createAgendaFormat` reads, each at every call. */
export interface AgendaFormatSources {
  settings: () => AgendaFormatSettings;
  /** The view, range and anchor the toolbar's period is of. */
  period: () => {
    view: ResolvedAgendaView;
    range: AgendaRange;
    anchor: AgendaDayKey;
  };
}

/** The agenda's formats, bound to the reader's locale and clock and the agenda's zone. */
export function createAgendaFormat(sources: AgendaFormatSources): AgendaFormat {
  const locale = computed(() => sources.settings().locale);
  return {
    locale,
    time: (epoch) => formatAgendaTime(epoch, sources.settings()),
    timeRange: (start, end) =>
      formatAgendaTimeRange(start, end, sources.settings()),
    day: (key, style) => formatAgendaDay(key, style, locale.value),
    month: (year, month) => formatAgendaMonth(year, month, locale.value),
    title: computed(() => {
      const { view, range, anchor } = sources.period();
      return formatAgendaPeriod(view, range, anchor, locale.value);
    }),
    duration: formatAgendaDuration,
  };
}

/** One entry of the time zone picker. */
export interface TimeZoneOption {
  /** IANA identifier (`Europe/Brussels`). */
  value: string;
  /** `Europe / Brussels`. */
  label: string;
  /** `UTC+02:00`, at the moment the list was built. */
  offset: string;
}

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

/** Offered when the runtime cannot list its zones. */
const FALLBACK_TIME_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const UTC_LABEL = "UTC";
const GMT_PREFIX = /^GMT/;
const OFFSET_PATTERN = /^UTC([+-])(\d{2}):(\d{2})$/;
const MINUTES_PER_HOUR = 60;

/** Every IANA zone the runtime knows. */
export function listTimeZones(): string[] {
  return (
    (Intl as IntlWithSupportedValues).supportedValuesOf?.("timeZone") ??
    FALLBACK_TIME_ZONES
  );
}

/** `UTC+02:00`: the offset of `timeZone` at `at`. */
export function timeZoneOffset(timeZone: string, at: Date): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  if (!name || name === "GMT") return `${UTC_LABEL}+00:00`;
  return name.replace(GMT_PREFIX, UTC_LABEL);
}

/** Minutes east of UTC an offset label stands for, to sort by it. */
function offsetMinutes(offset: string): number {
  const match = OFFSET_PATTERN.exec(offset);
  if (!match) return 0;
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * MINUTES_PER_HOUR + Number(minutes);
  return sign === "-" ? -total : total;
}

/** `America/Argentina/Buenos_Aires` → `America / Argentina / Buenos Aires`. */
export function timeZoneLabel(timeZone: string): string {
  return timeZone.replaceAll("_", " ").split("/").join(" / ");
}

/**
 * The picker's entries, west to east then by name. `extra` adds zones the
 * runtime does not list but the user may hold (an alias the browser reports).
 */
export function buildTimeZoneOptions(
  zones: string[],
  at: Date,
  extra: string[] = [],
): TimeZoneOption[] {
  const unique = [...new Set([...zones, ...extra.filter(Boolean)])];
  return unique
    .map((value) => ({
      value,
      label: timeZoneLabel(value),
      offset: timeZoneOffset(value, at),
    }))
    .sort(
      (a, b) =>
        offsetMinutes(a.offset) - offsetMinutes(b.offset) ||
        a.label.localeCompare(b.label),
    );
}

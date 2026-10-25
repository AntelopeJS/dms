// The events shown as an iCalendar file (RFC 5545): each occurrence an
// event of its own (a series expanded for the range), timed ones in UTC,
// all-day ones as dates with an exclusive end.

import type { AgendaOccurrence } from "./agendaModel";
import { addDays, parseDayKey } from "./agendaTime";

const LINE_BREAK = "\r\n";
const MAX_LINE_OCTETS = 75;
const PRODUCT_ID = "-//AntelopeJS//DMS FullAgenda//EN";
const UID_DOMAIN = "dms-agenda";
const TAG_PATTERN = /<[^>]*>/g;
const ICS_MIME = "text/calendar;charset=utf-8";
const PAD = 2;
const YEAR_PAD = 4;

const STATUS_OF: Record<string, string> = {
  confirmed: "CONFIRMED",
  tentative: "TENTATIVE",
  cancelled: "CANCELLED",
};

/** Text as a property value: backslashes, semicolons, commas and line breaks escaped. */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** A line folded at 75 octets, the rest on lines starting with a space. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const charSize = encoder.encode(char).length;
    const limit = parts.length ? MAX_LINE_OCTETS - 1 : MAX_LINE_OCTETS;
    if (size + charSize > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join(`${LINE_BREAK} `);
}

const pad = (value: number, length = PAD) =>
  String(value).padStart(length, "0");

/** An instant as `YYYYMMDDTHHMMSSZ`. */
export function icsInstant(epoch: number): string {
  const date = new Date(epoch);
  return (
    `${pad(date.getUTCFullYear(), YEAR_PAD)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** A day key as `YYYYMMDD`. */
export function icsDate(key: string): string {
  const { year, month, day } = parseDayKey(key);
  return `${pad(year, YEAR_PAD)}${pad(month)}${pad(day)}`;
}

/** What an export writes besides the occurrences. */
export interface AgendaIcsOptions {
  /** The calendar's name (`X-WR-CALNAME`). */
  name?: string;
  /** When the file is written (`DTSTAMP`). */
  now: number;
  /** A calendar's label, written as the event's category. */
  calendarLabel?: (occurrence: AgendaOccurrence) => string | undefined;
}

function occurrenceLines(
  occurrence: AgendaOccurrence,
  options: AgendaIcsOptions,
): string[] {
  const { event } = occurrence;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(occurrence.key)}@${UID_DOMAIN}`,
    `DTSTAMP:${icsInstant(options.now)}`,
  ];
  if (occurrence.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(occurrence.startDay)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(occurrence.endDay, 1))}`);
  } else {
    lines.push(`DTSTART:${icsInstant(occurrence.start)}`);
    lines.push(`DTEND:${icsInstant(occurrence.end)}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(event.title ?? "")}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  const description = event.description?.replace(TAG_PATTERN, "").trim();
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  const category = options.calendarLabel?.(occurrence);
  if (category) lines.push(`CATEGORIES:${escapeIcsText(category)}`);
  const status = event.status ? STATUS_OF[event.status] : undefined;
  if (status) lines.push(`STATUS:${status}`);
  lines.push("END:VEVENT");
  return lines;
}

/** The occurrences as the text of an `.ics` file. */
export function buildAgendaIcs(
  occurrences: AgendaOccurrence[],
  options: AgendaIcsOptions,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    ...(options.name ? [`X-WR-CALNAME:${escapeIcsText(options.name)}`] : []),
    ...occurrences.flatMap((occurrence) =>
      occurrenceLines(occurrence, options),
    ),
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join(LINE_BREAK) + LINE_BREAK;
}

/** A file name for the export of a range ("agenda-2026-10-19-2026-10-25.ics"). */
export function agendaIcsFileName(
  name: string,
  from: string,
  to: string,
): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "agenda";
  return `${base}-${from}-${to}.ics`;
}

/** Hands the browser the text as a file to save. */
export function downloadAgendaIcs(text: string, fileName: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type: ICS_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** What an export of the range writes. */
export interface AgendaIcsExport {
  /** The agenda's title; "agenda" when it has none. */
  name: string;
  range: { from: string; to: string };
  calendarLabel: (occurrence: AgendaOccurrence) => string | undefined;
}

/** Downloads the occurrences shown as `<name>-<from>-<to>.ics`. */
export function exportAgendaIcs(
  occurrences: AgendaOccurrence[],
  target: AgendaIcsExport,
): void {
  const name = target.name || "agenda";
  const text = buildAgendaIcs(occurrences, {
    name,
    now: Date.now(),
    calendarLabel: target.calendarLabel,
  });
  downloadAgendaIcs(
    text,
    agendaIcsFileName(name, target.range.from, target.range.to),
  );
}

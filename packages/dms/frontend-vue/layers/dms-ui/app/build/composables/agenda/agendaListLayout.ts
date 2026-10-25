// The layout of a `list` view: the days of the range that hold events, each
// with its events in order (all-day ones first, then by start), an event of
// several days listed under each day it covers. Also the day index the year
// view shares.

import type { AgendaDay, AgendaDayKey, AgendaOccurrence } from "./agendaModel";
import { addDays } from "./agendaTime";

/** How an event shows on one of its days. */
export type AgendaListPart =
  /** All-day event. */
  | "allDay"
  /** Starts and ends on this day. */
  | "single"
  /** Starts on this day and runs on. */
  | "start"
  /** Runs through this whole day. */
  | "middle"
  /** Started earlier and ends on this day. */
  | "end";

export interface AgendaListRow {
  key: string;
  occurrence: AgendaOccurrence;
  part: AgendaListPart;
}

export interface AgendaListDay {
  day: AgendaDay;
  rows: AgendaListRow[];
}

/** A bound on the days an event is listed under (a very long one). */
const MAX_DAYS_PER_EVENT = 400;

/**
 * The days of `[from, to]` each occurrence covers, indexed by day: an
 * all-day one from its first to its last day, a timed one from the day it
 * starts to the day it ends (a 22:00–02:00 shift covers two days).
 */
export function occurrencesByDay(
  occurrences: readonly AgendaOccurrence[],
  from: AgendaDayKey,
  to: AgendaDayKey,
): Map<AgendaDayKey, AgendaOccurrence[]> {
  const byDay = new Map<AgendaDayKey, AgendaOccurrence[]>();
  for (const occurrence of occurrences) {
    if (occurrence.endDay < from || occurrence.startDay > to) continue;
    let day = occurrence.startDay < from ? from : occurrence.startDay;
    const last = occurrence.endDay > to ? to : occurrence.endDay;
    for (let step = 0; day <= last && step < MAX_DAYS_PER_EVENT; step += 1) {
      const list = byDay.get(day);
      if (list) list.push(occurrence);
      else byDay.set(day, [occurrence]);
      day = addDays(day, 1);
    }
  }
  return byDay;
}

function partOn(
  occurrence: AgendaOccurrence,
  day: AgendaDayKey,
): AgendaListPart {
  if (occurrence.allDay) return "allDay";
  const starts = occurrence.startDay === day;
  const ends = occurrence.endDay === day;
  if (starts && ends) return "single";
  if (starts) return "start";
  if (ends) return "end";
  return "middle";
}

/** All-day (and whole-day) rows first, then by start, then the shorter first. */
function compareRows(a: AgendaListRow, b: AgendaListRow): number {
  const wholeA = a.part === "allDay" || a.part === "middle" ? 0 : 1;
  const wholeB = b.part === "allDay" || b.part === "middle" ? 0 : 1;
  if (wholeA !== wholeB) return wholeA - wholeB;
  const startA = a.part === "end" ? 0 : a.occurrence.start;
  const startB = b.part === "end" ? 0 : b.occurrence.start;
  return (
    startA - startB ||
    a.occurrence.end - b.occurrence.end ||
    a.occurrence.event.title.localeCompare(b.occurrence.event.title)
  );
}

/** The days of the range that hold events, with their rows in order; empty days are left out. */
export function buildAgendaList(
  days: readonly AgendaDay[],
  occurrences: readonly AgendaOccurrence[],
): AgendaListDay[] {
  if (!days.length) return [];
  const byDay = occurrencesByDay(occurrences, days[0]!.key, days.at(-1)!.key);
  const list: AgendaListDay[] = [];
  for (const day of days) {
    const shown = byDay.get(day.key);
    if (!shown?.length) continue;
    const rows = shown
      .map((occurrence) => ({
        key: `${occurrence.key}|${day.key}`,
        occurrence,
        part: partOn(occurrence, day.key),
      }))
      .sort(compareRows);
    list.push({ day, rows });
  }
  return list;
}

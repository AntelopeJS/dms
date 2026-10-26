// What an event is called for a screen reader: its title, when it is, its
// calendar, and the state of a change not written yet.

import type { AgendaFormat, AgendaOccurrence } from "./agendaModel";

const A11Y_PREFIX = "dms.agenda.a11y";

/** What a description is written with. */
export interface AgendaDescribeTools {
  format: Pick<AgendaFormat, "day" | "time">;
  t: (key: string, params?: Record<string, unknown>) => string;
  /** A calendar's label as text. */
  calendarLabel: (occurrence: AgendaOccurrence) => string;
}

/** "Monday 26 October 09:00 to 09:15", "Monday 26 October, all day", "26 to 30 October, all day". */
export function describeWhen(
  occurrence: AgendaOccurrence,
  tools: AgendaDescribeTools,
): string {
  const { format, t } = tools;
  const day = format.day(occurrence.startDay, "long");
  if (!occurrence.allDay && occurrence.startDay !== occurrence.endDay)
    return t(`${A11Y_PREFIX}.timed_days`, {
      from: day,
      start: format.time(occurrence.start),
      to: format.day(occurrence.endDay, "long"),
      end: format.time(occurrence.end),
    });
  if (!occurrence.allDay)
    return t(`${A11Y_PREFIX}.timed`, {
      day,
      start: format.time(occurrence.start),
      end: format.time(occurrence.end),
    });
  if (occurrence.startDay === occurrence.endDay)
    return t(`${A11Y_PREFIX}.all_day`, { day });
  return t(`${A11Y_PREFIX}.days`, {
    from: day,
    to: format.day(occurrence.endDay, "long"),
  });
}

/** A chip's aria-label: "Design standup, Monday 26 October 09:00 to 09:15, calendar Design". */
export function describeOccurrence(
  occurrence: AgendaOccurrence,
  tools: AgendaDescribeTools,
): string {
  const { t } = tools;
  const title = occurrence.event.title;
  const when = describeWhen(occurrence, tools);
  const calendar = tools.calendarLabel(occurrence);
  const label = calendar
    ? t(`${A11Y_PREFIX}.event_calendar`, { title, when, calendar })
    : t(`${A11Y_PREFIX}.event`, { title, when });
  if (!occurrence.state) return label;
  return `${label}, ${t(`${A11Y_PREFIX}.state_${occurrence.state}`)}`;
}

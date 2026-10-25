// Whether a placement may be dropped: the resource limits of the event and
// of the agenda, the `constraints` of the block, the range navigation stops
// at. The first broken rule names the refusal shown beside the preview.

import type {
  AgendaBackground,
  AgendaBusinessHours,
  AgendaCalendar,
  AgendaConstraints,
  AgendaResource,
} from "../../../types/full-agenda";
import type {
  AgendaDayKey,
  AgendaOccurrence,
  AgendaPlacement,
} from "./agendaModel";
import {
  MINUTES_PER_DAY,
  MINUTE_MS,
  addDays,
  weekdayOf,
  zonedDayKey,
  zonedMinutes,
} from "./agendaTime";
import { openIntervals, withinOpen } from "./agendaOpenHours";
import { lastDayOf } from "./agendaDragBasics";
import { backgroundAppliesTo, backgroundSpans } from "./agendaBackgroundSpans";

/** Why a drop is refused (`dms.agenda.drag.reason.<code>`). */
export type AgendaDragRefusal =
  | "resourceReadOnly"
  | "resourceNotAllowed"
  | "calendarReadOnly"
  | "tooShort"
  | "tooLong"
  | "outsideHours"
  | "closed"
  | "overlap"
  | "outOfRange";

/** The drop to check. */
export interface AgendaDropCheck {
  placement: AgendaPlacement;
  /** The occurrence moved or resized (left out of the overlap check unless copied). */
  occurrence?: AgendaOccurrence;
  copy: boolean;
  /** The event's or pending item's own resource limit. */
  allowedResourceIds?: string[];
  /** A pending item's calendar (an event of a read-only calendar does not move at all). */
  calendarId?: string;
  /** A move or a resize that keeps the length: the duration limits are the resize's business. */
  checkDuration: boolean;
}

/** What the rules read of the agenda. */
export interface AgendaDropRules {
  timeZone: string;
  constraints: AgendaConstraints;
  resources: Map<string, AgendaResource>;
  /** The agenda's own business hours (the resources may carry theirs). */
  businessHours: AgendaBusinessHours[];
  hoursOn: (weekday: number, resourceId?: string) => AgendaBusinessHours[];
  backgrounds: AgendaBackground[];
  /**
   * Every occurrence of the range, those the legend, the search or the
   * facets hide included: a hidden event still takes its time.
   */
  occurrences: AgendaOccurrence[];
  calendars: AgendaCalendar[];
  minDate?: string;
  maxDate?: string;
}

type Rule = (
  check: AgendaDropCheck,
  rules: AgendaDropRules,
) => AgendaDragRefusal | null;

/** Stops a walk over the days of a placement on a runaway length. */
const MAX_CHECKED_DAYS = 62;

/** The resources a placement is checked against; `[undefined]` for the agenda itself. */
const checkedResources = (
  placement: AgendaPlacement,
): Array<string | undefined> =>
  placement.resourceIds.length ? placement.resourceIds : [undefined];

function readOnlyResource(check: AgendaDropCheck, rules: AgendaDropRules) {
  return check.placement.resourceIds.some(
    (id) => rules.resources.get(id)?.editable === false,
  )
    ? "resourceReadOnly"
    : null;
}

function notAllowedResource(check: AgendaDropCheck) {
  const allowed = check.allowedResourceIds;
  if (!allowed?.length) return null;
  const { resourceIds } = check.placement;
  // Planned on no resource: only an event that already had none may stay so.
  if (!resourceIds.length) {
    return check.occurrence?.resourceIds.length === 0
      ? null
      : "resourceNotAllowed";
  }
  return resourceIds.some((id) => !allowed.includes(id))
    ? "resourceNotAllowed"
    : null;
}

function readOnlyCalendar(check: AgendaDropCheck, rules: AgendaDropRules) {
  if (!check.calendarId) return null;
  const calendar = rules.calendars.find((item) => item.id === check.calendarId);
  return calendar?.editable === false ? "calendarReadOnly" : null;
}

function duration(check: AgendaDropCheck, rules: AgendaDropRules) {
  const { placement } = check;
  if (!check.checkDuration || placement.allDay) return null;
  const minutes = (placement.end - placement.start) / MINUTE_MS;
  const { minDurationMinutes: min, maxDurationMinutes: max } =
    rules.constraints;
  if (min !== undefined && minutes < min) return "tooShort";
  if (max !== undefined && minutes > max) return "tooLong";
  return null;
}

function outOfRange(check: AgendaDropCheck, rules: AgendaDropRules) {
  const first = zonedDayKey(check.placement.start, rules.timeZone);
  const last = lastDayOf(check.placement, rules.timeZone);
  if (rules.minDate && first < rules.minDate) return "outOfRange";
  if (rules.maxDate && last > rules.maxDate) return "outOfRange";
  return null;
}

/** The days a placement touches, first to last. */
function placementDays(
  placement: AgendaPlacement,
  timeZone: string,
): AgendaDayKey[] {
  const days: AgendaDayKey[] = [];
  const last = lastDayOf(placement, timeZone);
  let day = zonedDayKey(placement.start, timeZone);
  while (day <= last && days.length < MAX_CHECKED_DAYS) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

const hasHours = (rules: AgendaDropRules, resourceId?: string) =>
  rules.businessHours.length > 0 ||
  (resourceId !== undefined &&
    (rules.resources.get(resourceId)?.businessHours?.length ?? 0) > 0);

/** The wall minutes of a timed placement on one of its days. */
function dayPiece(
  placement: AgendaPlacement,
  day: AgendaDayKey,
  timeZone: string,
): [number, number] {
  const startDay = zonedDayKey(placement.start, timeZone);
  const endDay = zonedDayKey(placement.end, timeZone);
  const from = day === startDay ? zonedMinutes(placement.start, timeZone) : 0;
  const to =
    day === endDay ? zonedMinutes(placement.end, timeZone) : MINUTES_PER_DAY;
  return [from, to];
}

function businessHours(check: AgendaDropCheck, rules: AgendaDropRules) {
  if (!rules.constraints.withinBusinessHours) return null;
  const { placement } = check;
  for (const resourceId of checkedResources(placement)) {
    if (!hasHours(rules, resourceId)) continue;
    for (const day of placementDays(placement, rules.timeZone)) {
      const open = openIntervals(
        rules.hoursOn(weekdayOf(day), resourceId),
        rules.hoursOn(weekdayOf(addDays(day, -1)), resourceId),
      );
      if (!open.length) return "closed";
      if (placement.allDay) continue;
      const [from, to] = dayPiece(placement, day, rules.timeZone);
      if (!withinOpen(open, from, to)) return "outsideHours";
    }
  }
  return null;
}

function closedBackground(check: AgendaDropCheck, rules: AgendaDropRules) {
  if (!rules.constraints.withinBusinessHours) return null;
  const { placement } = check;
  const isClosed = backgroundSpans(rules.backgrounds, rules.timeZone).some(
    (span) => {
      if (span.background.kind !== "closed") return false;
      if (!(span.start < placement.end && placement.start < span.end))
        return false;
      return checkedResources(placement).some((id) =>
        backgroundAppliesTo(span, id ?? null),
      );
    },
  );
  return isClosed ? "closed" : null;
}

/**
 * The events a placement shares its row with: those of one of its
 * resources; with resources but none of its own, those planned on no
 * resource (the "No resource" column or row); without resources, all.
 */
function sameRowAs(
  resourceIds: string[],
  hasResources: boolean,
): (other: AgendaOccurrence) => boolean {
  if (!hasResources) return () => true;
  if (!resourceIds.length) return (other) => !other.resourceIds.length;
  return (other) => other.resourceIds.some((id) => resourceIds.includes(id));
}

/**
 * `allowOverlap: false`: timed events of one resource (or of the agenda,
 * without resources) may not overlap. All-day events (a leave, a holiday)
 * and cancelled ones neither block a drop nor are blocked: they mark a day,
 * they do not take its hours.
 */
function overlap(check: AgendaDropCheck, rules: AgendaDropRules) {
  if (rules.constraints.allowOverlap !== false) return null;
  const { placement, occurrence } = check;
  if (placement.allDay) return null;
  const sameRow = sameRowAs(placement.resourceIds, rules.resources.size > 0);
  const clashes = rules.occurrences.some((other) => {
    if (!check.copy && other.key === occurrence?.key) return false;
    if (other.allDay || other.event.status === "cancelled") return false;
    if (!sameRow(other)) return false;
    return other.start < placement.end && placement.start < other.end;
  });
  return clashes ? "overlap" : null;
}

const RULES: Rule[] = [
  readOnlyResource,
  notAllowedResource,
  readOnlyCalendar,
  outOfRange,
  duration,
  businessHours,
  closedBackground,
  overlap,
];

/** The first rule a drop breaks, or `null` when it may land. */
export function checkDrop(
  check: AgendaDropCheck,
  rules: AgendaDropRules,
): AgendaDragRefusal | null {
  for (const rule of RULES) {
    const refusal = rule(check, rules);
    if (refusal) return refusal;
  }
  return null;
}

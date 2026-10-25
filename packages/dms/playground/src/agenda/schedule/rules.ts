import type {
  AgendaEvent,
  AgendaIssue,
  AgendaNotice,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { AgendaState, RuleContext } from "../store";
import {
  addDays,
  dayOf,
  daysBetween,
  minutesBetween,
  weekdayOf,
} from "../time";
import {
  fullName,
  personOf,
  staffOf,
  type Store,
  storeOf,
  STORES,
} from "./data";

const MINUTES_PER_HOUR = 60;
const PAUSE_REQUIRED_AFTER = 6 * MINUTES_PER_HOUR;
const MAX_WORKED = 9 * MINUTES_PER_HOUR;
const MIN_REST = 11 * MINUTES_PER_HOUR;
const MAX_NOTICE_DAYS = 62;

const DAY_FORMAT = new Intl.DateTimeFormat("fr-BE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "mardi 20 octobre". */
export function dayLabel(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T12:00:00Z`));
}

function pauseOf(shift: AgendaEvent): number {
  const pause = Number(shift.data?.pause ?? 0);
  return Number.isFinite(pause) && pause > 0 ? pause : 0;
}

function storeIdOf(shift: AgendaEvent): string {
  const store = shift.data?.store;
  return typeof store === "string" ? store : "";
}

function span(shift: AgendaEvent): number {
  return shift.end ? minutesBetween(shift.start, shift.end) : 0;
}

/** Minutes worked: the shift less its pause. */
export function workedMinutes(shift: AgendaEvent): number {
  return Math.max(0, span(shift) - pauseOf(shift));
}

function hours(minutes: number): string {
  const whole = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return rest ? `${whole} h ${String(rest).padStart(2, "0")}` : `${whole} h`;
}

function shiftsOf(personId: string, events: AgendaEvent[]): AgendaEvent[] {
  return events
    .filter((other) => other.resourceIds?.[0] === personId)
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

/** Minutes of rest before a shift, since the person's previous one ended. */
function restBefore(shift: AgendaEvent, events: AgendaEvent[]): number {
  const own = shiftsOf(shift.resourceIds?.[0] ?? "", events);
  const earlier = own.filter(
    (other) => Date.parse(other.start) < Date.parse(shift.start),
  );
  const previous = earlier[earlier.length - 1];
  if (!previous?.end) return Number.POSITIVE_INFINITY;
  return minutesBetween(previous.end, shift.start);
}

/** A labour rule a shift breaks. */
interface ShiftIssue extends AgendaIssue {
  tone: "error";
  message: string;
}

/** What breaks the labour rules in a shift, each as an issue. */
export function shiftIssues(
  shift: AgendaEvent,
  events: AgendaEvent[],
): ShiftIssue[] {
  const issues: ShiftIssue[] = [];
  if (span(shift) > PAUSE_REQUIRED_AFTER && pauseOf(shift) === 0) {
    issues.push({
      tone: "error",
      message: `${hours(span(shift))} sans pause : pause obligatoire au-delà de 6 h`,
    });
  }
  if (workedMinutes(shift) > MAX_WORKED) {
    issues.push({
      tone: "error",
      message: `${hours(workedMinutes(shift))} prestées : plus de 9 h`,
    });
  }
  const rest = restBefore(shift, events);
  if (rest < MIN_REST) {
    issues.push({
      tone: "error",
      message: `${hours(rest)} de repos depuis l'horaire précédent : moins de 11 h`,
    });
  }
  return issues;
}

/** A shift as the route answers it: its person, role, pause and store, its issues. */
export function decorateShift(
  shift: AgendaEvent,
  state: AgendaState,
): AgendaEvent {
  const person = personOf(shift.resourceIds?.[0]);
  const note = typeof shift.data?.note === "string" ? shift.data.note : "";
  const parts = [`pause ${pauseOf(shift)} min`, storeIdOf(shift), note];
  return {
    ...shift,
    title: person ? fullName(person) : shift.title,
    calendarId: person?.role ?? shift.calendarId,
    subtitle: parts.filter(Boolean).join(" · "),
    allowedResourceIds: staffOf(storeIdOf(shift)),
    issues: shiftIssues(shift, state.events),
  };
}

function staffingNotice(
  store: Store,
  day: string,
  events: AgendaEvent[],
): AgendaNotice[] {
  const need = store.need[weekdayOf(day)] ?? 0;
  const planned = events.filter(
    (shift) => storeIdOf(shift) === store.id && dayOf(shift.start) === day,
  ).length;
  if (!need || planned >= need) return [];
  return [
    {
      id: `staffing-${store.id}-${day}`,
      tone: "warning",
      message: `Sous-effectif ${store.id} ${dayLabel(day)} : ${planned}/${need}`,
      date: day,
    },
  ];
}

/**
 * The agenda's own problems of the days shown, the sidebar's notices: the
 * stores under the staff they need, per day. A shift's own problems (a
 * break, 9 hours, 11 hours of rest) are its `issues`, which mark its chip
 * and are listed with the notices: answering them here too would list them
 * twice.
 */
export function scheduleNotices(
  state: AgendaState,
  from: string,
  to: string,
): AgendaNotice[] {
  const length = Math.min(daysBetween(from, to), MAX_NOTICE_DAYS);
  const days = Array.from({ length: length + 1 }, (_, index) =>
    addDays(from, index),
  );
  const staffing = STORES.flatMap((store) =>
    days.flatMap((day) => staffingNotice(store, day, state.events)),
  );
  return staffing;
}

function overlaps(shift: AgendaEvent, other: AgendaEvent): boolean {
  if (!shift.end || !other.end || other.id === shift.id) return false;
  return (
    Date.parse(shift.start) < Date.parse(other.end) &&
    Date.parse(other.start) < Date.parse(shift.end)
  );
}

/**
 * Why a shift may not be written: the person may not work in its store, the
 * store is closed that day, or the person already works then.
 */
export function refuseShift(
  shift: AgendaEvent,
  { state }: RuleContext,
): string | undefined {
  const person = personOf(shift.resourceIds?.[0]);
  if (!person) return "Choisissez un collaborateur.";
  const store = storeOf(storeIdOf(shift));
  if (!store) return "Choisissez un magasin.";
  if (!person.stores.includes(store.id)) {
    return `${fullName(person)} ne travaille pas à ${store.label}.`;
  }
  const weekday = weekdayOf(dayOf(shift.start));
  if (!store.hours.some((hours) => hours.days.includes(weekday))) {
    return `${store.label} est fermé le ${dayLabel(dayOf(shift.start)).split(" ")[0]}.`;
  }
  if (!shift.end || Date.parse(shift.end) <= Date.parse(shift.start)) {
    return "L'horaire se termine avant de commencer.";
  }
  const clash = shiftsOf(person.id, state.events).find((other) =>
    overlaps(shift, other),
  );
  return clash
    ? `${fullName(person)} a déjà un horaire qui chevauche celui-ci.`
    : undefined;
}

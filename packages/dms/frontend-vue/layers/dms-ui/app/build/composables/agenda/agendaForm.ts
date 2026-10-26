// The details form of a FullAgenda, as data: its fields with their defaults,
// the values it opens with (from an occurrence or a placement), what it
// refuses, and the change it saves. No Vue here: the form component binds it.

import type { BlockText } from "#dms-core/app/types/composed-text";
import {
  AGENDA_BUILT_IN_FIELDS,
  type AgendaBuiltInField,
  type AgendaCalendar,
  type AgendaEventPatch,
  type AgendaField,
  type AgendaFieldCondition,
  type AgendaFieldKind,
  type AgendaFieldOption,
  type AgendaResource,
} from "../../../types/full-agenda";
import type { AgendaOccurrence, AgendaPlacement } from "./agendaModel";
import {
  dayOfWallClock,
  timeOfWallClock,
  wallClockEpoch,
  wallClockIso,
  wallClockOf,
  withTime,
  previousDay,
} from "./agendaFormTime";

/** What the form holds, by field id. `start` / `end` are wall clocks `YYYY-MM-DDTHH:mm`. */
export type AgendaFormValues = Record<string, unknown>;

/** What the form refuses, by field id: `$`-prefixed i18n keys. */
export type AgendaFormErrors = Record<string, string>;

/** A field of the form with its defaults applied. */
export interface AgendaFormField {
  id: string;
  /** Set on the fields the agenda knows (title, start...); the others live in `data`. */
  builtIn?: AgendaBuiltInField;
  kind: AgendaFieldKind;
  label: BlockText;
  options: AgendaFieldOption[];
  required: boolean;
  readOnly: boolean;
  placeholder?: BlockText;
  hint?: BlockText;
  visibleWhen?: AgendaFieldCondition;
}

/** What the fields are built from. */
export interface AgendaFormSources {
  fields?: AgendaField[];
  calendars: AgendaCalendar[];
  resources: AgendaResource[];
  text: (value: BlockText) => string;
}

/** What a new event starts with besides its placement. */
export interface AgendaFormDefaults {
  calendarId?: string;
  title?: string;
}

/** How a built-in field is edited when `fields` does not say. */
interface BuiltInDefault {
  kind: AgendaFieldKind;
  required: boolean;
}

const BUILT_IN_DEFAULTS: Record<AgendaBuiltInField, BuiltInDefault> = {
  title: { kind: "text", required: true },
  calendarId: { kind: "select", required: false },
  resourceIds: { kind: "tags", required: false },
  allDay: { kind: "boolean", required: false },
  start: { kind: "datetime", required: true },
  end: { kind: "datetime", required: true },
  location: { kind: "text", required: false },
  description: { kind: "longText", required: false },
};

const BUILT_IN_SET: ReadonlySet<string> = new Set(AGENDA_BUILT_IN_FIELDS);
const LABEL_KEY_PREFIX = "$dms.agenda.form.";
/** Times a timed event gets when an all-day one is switched to timed. */
const ALL_DAY_START_TIME = "09:00";
const ALL_DAY_END_TIME = "10:00";
const MIDNIGHT = "00:00";

export const AGENDA_FORM_ERRORS = {
  required: "$dms.agenda.form.required",
  invalidDate: "$dms.agenda.form.invalid_date",
  endBeforeStart: "$dms.agenda.form.end_before_start",
} as const;

/** Whether an id names a field the agenda knows. */
export function isBuiltInField(id: string): id is AgendaBuiltInField {
  return BUILT_IN_SET.has(id);
}

/** The built-in fields an agenda edits without being told: the calendar and resources only when it has some. */
function defaultBuiltIns(sources: AgendaFormSources): AgendaField[] {
  return AGENDA_BUILT_IN_FIELDS.filter((id) => {
    if (id === "calendarId") return sources.calendars.length > 0;
    if (id === "resourceIds") return sources.resources.length > 0;
    return true;
  }).map((id) => ({ id }));
}

function builtInOptions(
  id: AgendaBuiltInField,
  sources: AgendaFormSources,
): AgendaFieldOption[] | undefined {
  if (id === "calendarId")
    return sources.calendars.map((calendar) => ({
      value: calendar.id,
      label: calendar.label,
      icon: calendar.icon,
    }));
  if (id === "resourceIds")
    return sources.resources.map((resource) => ({
      value: resource.id,
      label: resource.label,
    }));
  return undefined;
}

function resolveField(
  field: AgendaField,
  sources: AgendaFormSources,
): AgendaFormField {
  const builtIn = isBuiltInField(field.id) ? field.id : undefined;
  const defaults = builtIn ? BUILT_IN_DEFAULTS[builtIn] : undefined;
  return {
    id: field.id,
    builtIn,
    kind: field.kind ?? defaults?.kind ?? "text",
    label:
      field.label ?? (builtIn ? `${LABEL_KEY_PREFIX}${builtIn}` : field.id),
    options:
      field.options ?? (builtIn ? builtInOptions(builtIn, sources) : []) ?? [],
    required: field.required ?? defaults?.required ?? false,
    readOnly: field.readOnly ?? false,
    placeholder: field.placeholder,
    hint: field.hint,
    visibleWhen: field.visibleWhen,
  };
}

/**
 * The fields of the form. A `fields` list naming no shown built-in field gets
 * the built-in ones first (title, calendar, resources, all day, start, end,
 * place, description), then its own; a list naming one is the whole form, in
 * its order. `visible: false` leaves a field out either way.
 */
export function resolveFormFields(
  sources: AgendaFormSources,
): AgendaFormField[] {
  const listed = sources.fields ?? [];
  const hidden = new Set(
    listed.filter((field) => field.visible === false).map((field) => field.id),
  );
  const shown = listed.filter((field) => field.visible !== false);
  const namesBuiltIn = shown.some((field) => isBuiltInField(field.id));
  const base = namesBuiltIn
    ? []
    : defaultBuiltIns(sources).filter((field) => !hidden.has(field.id));
  return [...base, ...shown].map((field) => resolveField(field, sources));
}

/** Whether a field shows with these values (`visibleWhen`). */
export function isFieldShown(
  field: Pick<AgendaFormField, "visibleWhen">,
  values: AgendaFormValues,
): boolean {
  if (!field.visibleWhen) return true;
  return field.visibleWhen.in.includes(values[field.visibleWhen.field]);
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  return Array.isArray(value) && value.length === 0;
}

function customValues(
  fields: AgendaFormField[],
  data: Record<string, unknown> | undefined,
): AgendaFormValues {
  const values: AgendaFormValues = {};
  for (const field of fields) {
    if (!field.builtIn) values[field.id] = data?.[field.id];
  }
  return values;
}

/** The values the form opens with on an occurrence. */
export function valuesFromOccurrence(
  occurrence: AgendaOccurrence,
  fields: AgendaFormField[],
  timeZone: string,
): AgendaFormValues {
  const { event } = occurrence;
  const moments = occurrence.allDay
    ? {
        start: `${occurrence.startDay}T${ALL_DAY_START_TIME}`,
        end: `${occurrence.endDay}T${ALL_DAY_END_TIME}`,
      }
    : {
        start: wallClockOf(occurrence.start, timeZone),
        end: wallClockOf(occurrence.end, timeZone),
      };
  return {
    ...customValues(fields, event.data),
    title: event.title,
    calendarId: event.calendarId ?? occurrence.calendar?.id,
    resourceIds: [...occurrence.resourceIds],
    allDay: occurrence.allDay,
    ...moments,
    location: event.location,
    description: event.description,
  };
}

/** The values the form of a new event opens with on a placement. */
export function valuesFromPlacement(
  placement: AgendaPlacement,
  fields: AgendaFormField[],
  timeZone: string,
  defaults: AgendaFormDefaults = {},
): AgendaFormValues {
  const start = wallClockOf(placement.start, timeZone);
  // An all-day placement ends at the midnight after its last day.
  const end = placement.allDay
    ? `${dayOfWallClock(wallClockOf(placement.end - 1, timeZone))}T${ALL_DAY_END_TIME}`
    : wallClockOf(placement.end, timeZone);
  return {
    ...customValues(fields, undefined),
    title: defaults.title ?? "",
    calendarId: defaults.calendarId,
    resourceIds: [...placement.resourceIds],
    allDay: placement.allDay,
    start: placement.allDay ? withTime(start, ALL_DAY_START_TIME) : start,
    end,
  };
}

/** The last day an all-day event covers: a timed end at midnight ends the day before. */
function allDayEnd(start: string, end: string): string {
  const startDay = dayOfWallClock(start);
  const endDay = dayOfWallClock(end);
  if (timeOfWallClock(end) === MIDNIGHT && endDay > startDay)
    return previousDay(endDay);
  return endDay;
}

function momentErrors(values: AgendaFormValues, timeZone: string) {
  const start = String(values.start ?? "");
  const end = String(values.end ?? "");
  const startAt = wallClockEpoch(start, timeZone);
  const endAt = wallClockEpoch(end, timeZone);
  const errors: AgendaFormErrors = {};
  if (start && startAt === null) errors.start = AGENDA_FORM_ERRORS.invalidDate;
  if (end && endAt === null) errors.end = AGENDA_FORM_ERRORS.invalidDate;
  if (startAt === null || endAt === null) return errors;
  const isBefore = values.allDay
    ? allDayEnd(start, end) < dayOfWallClock(start)
    : endAt <= startAt;
  if (isBefore) errors.end = AGENDA_FORM_ERRORS.endBeforeStart;
  return errors;
}

/** What the form refuses: a required field left empty, an end not after the start. */
export function validateForm(
  fields: AgendaFormField[],
  values: AgendaFormValues,
  timeZone: string,
): AgendaFormErrors {
  const errors: AgendaFormErrors = momentErrors(values, timeZone);
  for (const field of fields) {
    if (!field.required || field.readOnly || !isFieldShown(field, values))
      continue;
    if (isEmptyValue(values[field.id]))
      errors[field.id] = AGENDA_FORM_ERRORS.required;
  }
  return errors;
}

function momentPatch(
  values: AgendaFormValues,
  timeZone: string,
): Pick<AgendaEventPatch, "start" | "end" | "allDay"> {
  const start = String(values.start ?? "");
  const end = String(values.end ?? "");
  if (values.allDay)
    return {
      allDay: true,
      start: dayOfWallClock(start),
      end: allDayEnd(start, end),
    };
  return {
    allDay: false,
    start: wallClockIso(start, timeZone) ?? undefined,
    end: wallClockIso(end, timeZone) ?? undefined,
  };
}

// A field emptied in the form clears it: `null` (an absent key keeps it).
const textOrNull = (value: unknown): string | null =>
  isEmptyValue(value) ? null : String(value).trim();

/** The built-in fields a patch takes straight from the values. */
const PLAIN_PATCHES: Partial<
  Record<AgendaBuiltInField, (value: unknown) => Partial<AgendaEventPatch>>
> = {
  title: (value) => ({ title: String(value ?? "").trim() }),
  calendarId: (value) => ({ calendarId: textOrNull(value) }),
  resourceIds: (value) => ({
    resourceIds: Array.isArray(value) ? value.map(String) : [],
  }),
  location: (value) => ({ location: textOrNull(value) }),
  description: (value) => ({ description: textOrNull(value) }),
};

/**
 * Every field the form sets, as a patch: the editable fields shown, the
 * times in the agenda's zone (ISO instants, or days for an all-day event),
 * the custom fields under `data`.
 */
export function buildPatch(
  fields: AgendaFormField[],
  values: AgendaFormValues,
  timeZone: string,
): AgendaEventPatch {
  let patch: AgendaEventPatch = {};
  const data: Record<string, unknown> = {};
  let hasMoments = false;
  for (const field of fields) {
    if (field.readOnly || !isFieldShown(field, values)) continue;
    if (!field.builtIn) {
      data[field.id] = isEmptyValue(values[field.id]) ? null : values[field.id];
      continue;
    }
    const plain = PLAIN_PATCHES[field.builtIn];
    if (plain) patch = { ...patch, ...plain(values[field.builtIn]) };
    else hasMoments = true;
  }
  if (hasMoments) patch = { ...patch, ...momentPatch(values, timeZone) };
  if (Object.keys(data).length > 0) patch.data = data;
  return patch;
}

export * from "./agendaFormChanges";

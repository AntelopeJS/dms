import {
  isBoolean,
  isNumber,
  isString,
} from "../../../../../dms-core/app/utils/type-check";

import type { JsonValue } from "../../../../../dms-core/app/types/json";
import type { MatrixCellKind } from "../../../types/matrix";
import type { BlockText } from "../../../../../dms-core/app/types/composed-text";
import {
  AGENDA_BUILT_IN_FIELDS,
  type AgendaBuiltInField,
  type AgendaCalendar,
  type AgendaEventData,
  type AgendaEventPatch,
  type AgendaField,
  type AgendaFieldCondition,
  type AgendaFieldKind,
  type AgendaFieldOption,
  type AgendaRelation,
  type AgendaResource,
} from "../../../types/full-agenda";
import type { AgendaOccurrence, AgendaPlacement } from "./agendaModel";
import {
  dayOfWallClock,
  hasEmptiedTime,
  hasUnreadTime,
  timeOfWallClock,
  wallClockEpoch,
  wallClockIso,
  wallClockOf,
  withTime,
  previousDay,
} from "./agendaFormTime";

/** A value of the form: what a field holds, `undefined` before it is set. */
export type AgendaFormValue = JsonValue | undefined;

/** What the form holds, by field id. `start` / `end` are wall clocks `YYYY-MM-DDTHH:mm`. */
export interface AgendaFormValues {
  [field: string]: AgendaFormValue;
}

/** The value of one field, `undefined` when the form holds none. */
export const formValue = (
  values: AgendaFormValues | AgendaEventData,
  id: string,
): AgendaFormValue => (Object.hasOwn(values, id) ? values[id] : undefined);

/** A field's value as text: a number or a flag written out, anything else empty. */
export const formText = (value: AgendaFormValue): string =>
  isString(value) || isNumber(value) || isBoolean(value) ? String(value) : "";

/** The Matrix kind a field is drawn and edited as: a `time` or a `relation` field has its own input. */
export const matrixKindOf = (kind: AgendaFieldKind): MatrixCellKind =>
  kind === "time" || kind === "relation" ? "text" : kind;

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
  /** A `select` that picks several options. */
  multiple?: boolean;
  relation?: AgendaRelation;
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
  /** The choices the data answer gives, by field id, in place of the block's own. */
  fieldOptions?: Record<string, AgendaFieldOption[]>;
}

/** What a new event starts with besides its placement. */
export interface AgendaFormDefaults {
  calendarId?: string;
  title?: string;
  /** The custom fields a new event opens with, read by field id. */
  data?: AgendaEventData;
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
  invalidTime: "$dms.agenda.form.invalid_time",
  timeRequired: "$dms.agenda.form.time_required",
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
      sources.fieldOptions?.[field.id] ??
      field.options ??
      (builtIn ? builtInOptions(builtIn, sources) : []) ??
      [],
    multiple: field.multiple ?? builtIn === "resourceIds",
    relation: field.relation,
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
  return field.visibleWhen.in.includes(
    formValue(values, field.visibleWhen.field),
  );
}

function isEmptyValue(value: AgendaFormValue): boolean {
  if (value === undefined || value === null) return true;
  if (isString(value)) return value.trim() === "";
  return Array.isArray(value) && value.length === 0;
}

/**
 * The fields the details show an event with: those holding a value, so an
 * empty note or an unused field does not draw an empty row.
 */
export function fieldsWithValues<Field extends Pick<AgendaFormField, "id">>(
  fields: readonly Field[],
  values: AgendaFormValues,
): Field[] {
  return fields.filter((field) => !isEmptyValue(formValue(values, field.id)));
}

function customValues(
  fields: AgendaFormField[],
  data: AgendaEventData | undefined,
): AgendaFormValues {
  const values: AgendaFormValues = {};
  for (const field of fields) {
    if (!field.builtIn)
      values[field.id] = data ? formValue(data, field.id) : undefined;
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
  const end = placement.allDay
    ? `${dayOfWallClock(wallClockOf(placement.end - 1, timeZone))}T${ALL_DAY_END_TIME}`
    : wallClockOf(placement.end, timeZone);
  return {
    ...customValues(fields, defaults.data),
    title: defaults.title ?? "",
    calendarId: defaults.calendarId,
    resourceIds: [...placement.resourceIds],
    allDay: placement.allDay,
    start: placement.allDay ? withTime(start, ALL_DAY_START_TIME) : start,
    end,
  };
}

const MINUTE_MS = 60_000;

/** What a pick in the form needs to know of the event it edits. */
export interface AgendaPickContext {
  /** The form creates the event: only a new event takes an option's length. */
  isNew: boolean;
  timeZone: string;
  /** The length the form last showed, in ms: kept across a start that does not read. */
  length?: number;
}

/** The length in ms between the form's start and end when both read and the end is later; `undefined` otherwise. */
export function lengthOfForm(
  values: AgendaFormValues,
  timeZone: string,
): number | undefined {
  if (values.allDay) return undefined;
  const start = wallClockEpoch(formText(values.start), timeZone);
  const end = wallClockEpoch(formText(values.end), timeZone);
  return start !== null && end !== null && end > start
    ? end - start
    : undefined;
}

/** The values with a new start and the end moved along, so the event keeps the length the form showed. */
function withLengthKept(
  next: AgendaFormValues,
  values: AgendaFormValues,
  { timeZone, length: remembered }: AgendaPickContext,
): AgendaFormValues {
  const length = lengthOfForm(values, timeZone) ?? remembered;
  const after = wallClockEpoch(formText(next.start), timeZone);
  if (length === undefined || after === null) return next;
  return { ...next, end: wallClockOf(after + length, timeZone) };
}

/**
 * The values once `field` is set to `value`. A new start of a timed event
 * moves its end along, keeping its length, so the end the form shows is the
 * end it saves. Picking a choice that names a `durationMinutes` on a new
 * timed event also ends it that long after its start, counted in the
 * agenda's zone; an event already placed keeps its end.
 */
export function valuesAfterPick(
  field: Pick<AgendaFormField, "id" | "options">,
  value: AgendaFormValue,
  values: AgendaFormValues,
  context: AgendaPickContext,
): AgendaFormValues {
  const { isNew, timeZone } = context;
  const next = { ...values, [field.id]: value };
  if (values.allDay) return next;
  if (field.id === "start") return withLengthKept(next, values, context);
  const minutes = field.options.find(
    (option) => option.value === value,
  )?.durationMinutes;
  if (!isNew || minutes === undefined) return next;
  const start = wallClockEpoch(formText(values.start), timeZone);
  if (start === null) return next;
  return { ...next, end: wallClockOf(start + minutes * MINUTE_MS, timeZone) };
}

/** The last day an all-day event covers: a timed end at midnight ends the day before. */
function allDayEnd(start: string, end: string): string {
  const startDay = dayOfWallClock(start);
  const endDay = dayOfWallClock(end);
  if (timeOfWallClock(end) === MIDNIGHT && endDay > startDay)
    return previousDay(endDay);
  return endDay;
}

/** Why a start or end does not read: its time, when its day does. */
const momentError = (value: string) => {
  if (hasEmptiedTime(value)) return AGENDA_FORM_ERRORS.timeRequired;
  return hasUnreadTime(value)
    ? AGENDA_FORM_ERRORS.invalidTime
    : AGENDA_FORM_ERRORS.invalidDate;
};

function momentErrors(values: AgendaFormValues, timeZone: string) {
  const start = formText(values.start);
  const end = formText(values.end);
  const startAt = wallClockEpoch(start, timeZone);
  const endAt = wallClockEpoch(end, timeZone);
  const errors: AgendaFormErrors = {};
  if (start && startAt === null) errors.start = momentError(start);
  if (end && endAt === null) errors.end = momentError(end);
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
    if (isEmptyValue(formValue(values, field.id)))
      errors[field.id] = AGENDA_FORM_ERRORS.required;
  }
  return errors;
}

function momentPatch(
  values: AgendaFormValues,
  timeZone: string,
): Pick<AgendaEventPatch, "start" | "end" | "allDay"> {
  const start = formText(values.start);
  const end = formText(values.end);
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

const textOrNull = (value: AgendaFormValue): string | null =>
  isEmptyValue(value) ? null : formText(value).trim();

/** The built-in fields a patch takes straight from the values. */
const PLAIN_PATCHES: Partial<
  Record<
    AgendaBuiltInField,
    (value: AgendaFormValue) => Partial<AgendaEventPatch>
  >
> = {
  title: (value) => ({ title: formText(value).trim() }),
  calendarId: (value) => ({ calendarId: textOrNull(value) }),
  resourceIds: (value) => ({
    resourceIds: Array.isArray(value) ? value.map(formText) : [],
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
  const data: AgendaEventData = {};
  let hasMoments = false;
  for (const field of fields) {
    if (field.readOnly || !isFieldShown(field, values)) continue;
    if (!field.builtIn) {
      const value = formValue(values, field.id);
      data[field.id] =
        value === undefined || isEmptyValue(value) ? null : value;
      continue;
    }
    const plain = PLAIN_PATCHES[field.builtIn];
    if (plain) patch = { ...patch, ...plain(formValue(values, field.builtIn)) };
    else hasMoments = true;
  }
  if (hasMoments) patch = { ...patch, ...momentPatch(values, timeZone) };
  if (Object.keys(data).length > 0) patch.data = data;
  return patch;
}

export * from "./agendaFormChanges";

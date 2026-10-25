// The options of a FullAgenda with every default applied, for the view
// drawn and the reader's regional preferences.

import type { FullAgendaOptions } from "../../../types/full-agenda";
import type { ResolvedAgendaOptions, ResolvedAgendaView } from "./agendaModel";
import { isTimeZone, MINUTES_PER_DAY, parseTimeOfDay } from "./agendaTime";

const DEFAULT_SNAP_MINUTES = 15;
const DEFAULT_HOUR_HEIGHT = 48;
const DEFAULT_SCROLL_MINUTES = 8 * 60;
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_MAX_EVENTS_PER_DAY = 3;
export const DEFAULT_COMPACT_BELOW = 640;
export const DEFAULT_UNDO_SECONDS = 6;

/** What the reader's preferences give an agenda that does not say. */
export interface AgendaReaderDefaults {
  timeZone: string;
  weekStartsOn: number;
}

const WEEK_STARTS: ReadonlyArray<0 | 1 | 6> = [0, 1, 6];

function weekStartOf(value: number | undefined): 0 | 1 | 6 {
  return WEEK_STARTS.find((start) => start === value) ?? 1;
}

/** Editing is on: a `saveUrl`, and `editable` not turned off. */
export function isAgendaEditable(raw: FullAgendaOptions): boolean {
  return Boolean(raw.saveUrl) && raw.editable !== false;
}

/**
 * The options with their defaults: editing only with a `saveUrl`, dragging
 * and creating following `editable`, the view's hours and hidden days over
 * the block's, the zone and week start of the reader when the block gives
 * none (an unknown zone is ignored).
 */
export function resolveAgendaOptions(
  raw: FullAgendaOptions,
  view: ResolvedAgendaView,
  reader: AgendaReaderDefaults,
): ResolvedAgendaOptions {
  const editable = isAgendaEditable(raw);
  const create = typeof raw.create === "object" ? raw.create : {};
  const dayStartMinutes = parseTimeOfDay(view.dayStart, 0);
  const dayEndMinutes = Math.max(
    parseTimeOfDay(view.dayEnd, MINUTES_PER_DAY),
    dayStartMinutes,
  );
  const scrollMinutes = parseTimeOfDay(
    raw.scrollTime,
    Math.max(DEFAULT_SCROLL_MINUTES, dayStartMinutes),
  );
  return {
    raw,
    editable,
    dragMove: editable && raw.dragMove !== false,
    dragResize: editable && raw.dragResize !== false,
    canCreate: editable && raw.create !== false,
    createTrigger:
      create.trigger ?? (view.type === "timeline" ? "doubleClick" : "click"),
    dayStartMinutes,
    dayEndMinutes,
    slotMinutes: view.slotMinutes,
    snapMinutes: Math.max(1, raw.snapMinutes ?? DEFAULT_SNAP_MINUTES),
    hourHeight: raw.hourHeight ?? DEFAULT_HOUR_HEIGHT,
    scrollMinutes: Math.min(
      Math.max(scrollMinutes, dayStartMinutes),
      dayEndMinutes,
    ),
    defaultDurationMinutes: Math.max(
      1,
      raw.defaultDurationMinutes ?? DEFAULT_DURATION_MINUTES,
    ),
    maxEventsPerDay: raw.maxEventsPerDay ?? DEFAULT_MAX_EVENTS_PER_DAY,
    weekStartsOn: weekStartOf(raw.weekStartsOn ?? reader.weekStartsOn),
    hiddenDays: view.hiddenDays,
    timeZone: isTimeZone(raw.timeZone) ? raw.timeZone : reader.timeZone,
    slots: raw.slots ?? [],
    businessHours: raw.businessHours ?? [],
    fields: raw.fields ?? [],
    eventActions: raw.eventActions ?? [],
    toolbarActions: raw.toolbarActions ?? [],
    urlState: raw.urlState !== false,
    shortcuts: raw.shortcuts !== false,
    compactBelow: raw.responsive?.compactBelow ?? DEFAULT_COMPACT_BELOW,
  };
}

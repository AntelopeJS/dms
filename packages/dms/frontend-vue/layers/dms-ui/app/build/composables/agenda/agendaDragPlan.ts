// Planning a pending item without a pointer (the keyboard): the spots a
// drop could reach, tried in order from the anchor day, each through the
// same placement and rules as a drop. The first one allowed is written.

import type { AgendaPendingItem } from "../../../types/full-agenda";
import type { AgendaDayKey, AgendaDropTarget } from "./agendaModel";
import type { AgendaDragSource } from "./agendaDragBasics";
import { buildPreview, dropRules } from "./agendaDragPreview";
import type { AgendaDragDeps } from "./agendaDragPreview";
import { scheduleChange } from "./agendaDragChange";
import { parseSlots } from "./agendaSlots";
import { addDays, parseTimeOfDay, weekdayOf, zonedDayKey } from "./agendaTime";

/** Spots tried before giving up: a busy month of 60 resources stays quick. */
const MAX_SPOTS = 4000;
/** Days looked at without a range (the first two weeks from today). */
const FALLBACK_DAYS = 14;
const MINUTES_PER_DAY = 1440;

/** The shown days, from the anchor day on, then the ones before it. */
function plannedDays(deps: AgendaDragDeps): AgendaDayKey[] {
  const hidden = deps.view.value.hiddenDays ?? deps.options.value.hiddenDays;
  const today = zonedDayKey(Date.now(), deps.options.value.timeZone);
  const keys =
    deps.range?.value.days.map((day) => day.key) ??
    Array.from({ length: FALLBACK_DAYS }, (_, index) => addDays(today, index));
  const shown = keys.filter((key) => !hidden.includes(weekdayOf(key)));
  const anchor = deps.anchor?.value ?? today;
  return [
    ...shown.filter((key) => key >= anchor),
    ...shown.filter((key) => key < anchor),
  ];
}

/** The rows a view plans on: its resources (the allowed ones), else none. */
function plannedRows(
  deps: AgendaDragDeps,
  item: AgendaPendingItem,
): Array<Pick<AgendaDropTarget, "resourceId">> {
  const { type } = deps.view.value;
  const resources = deps.resources.value;
  if ((type !== "resources" && type !== "timeline") || !resources.length) {
    return [{}];
  }
  const allowed = item.allowedResourceIds;
  return resources
    .filter((resource) => resource.editable !== false)
    .filter((resource) => !allowed || allowed.includes(resource.id))
    .map((resource) => ({ resourceId: resource.id }));
}

/** The times of a day a timed item may start at: the shown hours, by the snap. */
function plannedMinutes(deps: AgendaDragDeps): number[] {
  const options = deps.options.value;
  const view = deps.view.value;
  const first = Math.max(
    parseTimeOfDay(view.dayStart, options.dayStartMinutes),
    options.scrollMinutes,
  );
  const last =
    parseTimeOfDay(view.dayEnd, options.dayEndMinutes) || MINUTES_PER_DAY;
  const step = Math.max(options.snapMinutes, 1);
  const minutes: number[] = [];
  for (let at = first; at < last; at += step) minutes.push(at);
  return minutes;
}

/** Every spot of a day and row, in order. */
function daySpots(
  deps: AgendaDragDeps,
  item: AgendaPendingItem,
  day: AgendaDayKey,
  row: Pick<AgendaDropTarget, "resourceId">,
): AgendaDropTarget[] {
  if (item.allDay) return [{ day, ...row, asAllDay: true }];
  const view = deps.view.value;
  const slots = parseSlots(deps.options.value.slots);
  if (view.type === "timeline" && view.scale === "slot" && slots.length) {
    return slots.map((slot, slotIndex) => ({
      day,
      slotIndex,
      minutes: slot.startMinutes,
      ...row,
    }));
  }
  return plannedMinutes(deps).map((minutes) => ({ day, minutes, ...row }));
}

/** The spots a pending item may be planned on, in the order they are tried. */
export function* planSpots(
  deps: AgendaDragDeps,
  item: AgendaPendingItem,
): Generator<AgendaDropTarget> {
  const rows = plannedRows(deps, item);
  let count = 0;
  for (const day of plannedDays(deps)) {
    for (const row of rows) {
      for (const spot of daySpots(deps, item, day, row)) {
        if (count >= MAX_SPOTS) return;
        count += 1;
        yield spot;
      }
    }
  }
}

/**
 * Plans a pending item: on `target`, or on the first spot allowed from the
 * anchor day. Resolves whether it was written.
 */
export async function planPendingItem(
  deps: AgendaDragDeps,
  item: AgendaPendingItem,
  target?: AgendaDropTarget,
): Promise<boolean> {
  if (!deps.options.value.editable) return false;
  const rules = dropRules(deps, "external");
  const source: AgendaDragSource = { kind: "external", item, origin: null };
  const spots = target ? [target] : planSpots(deps, item);
  for (const spot of spots) {
    const preview = buildPreview(deps, {
      source,
      target: spot,
      alt: false,
      rules,
    });
    if (!preview?.valid) continue;
    const change = scheduleChange(item, preview, deps.options.value.timeZone);
    return deps.apply(change).catch(() => false);
  }
  return false;
}

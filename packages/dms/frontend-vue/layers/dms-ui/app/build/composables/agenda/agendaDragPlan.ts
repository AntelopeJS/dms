// Planning a pending item without a pointer (the keyboard): the spots a
// drop could reach, tried in order from the anchor day, each through the
// same placement and rules as a drop. The first one allowed is written.

import type { AgendaPendingItem } from "../../../types/full-agenda";
import type {
  AgendaDayKey,
  AgendaDropTarget,
  AgendaPlacement,
} from "./agendaModel";
import type { AgendaDragSource } from "./agendaDragBasics";
import { placeDrag } from "./agendaDragMath";
import { checkDrop } from "./agendaDragRules";
import type { AgendaDragRefusal, AgendaDropRules } from "./agendaDragRules";
import { dropRules, viewDragConfig } from "./agendaDragPreview";
import type { AgendaDragDeps } from "./agendaDragPreview";
import { scheduleChange } from "./agendaDragChange";
import { parseSlots } from "./agendaSlots";
import { openIntervals } from "./agendaOpenHours";
import { addDays, parseTimeOfDay, weekdayOf, zonedDayKey } from "./agendaTime";

/**
 * Spots checked before giving up. Refusals that hold for a whole day or row
 * skip it at once, so this only bounds the times tried on open days.
 */
const MAX_CHECKS = 20_000;
/** Days looked at without a range (the first two weeks from today). */
const FALLBACK_DAYS = 14;
const MINUTES_PER_DAY = 1440;

/**
 * Refusals that hold for every time of a day and row: the rest of it is
 * skipped. `closed` is not one of them: a closed background may cover only
 * part of the day (see {@link isClosedAllDay}).
 */
const ROW_REFUSALS: ReadonlySet<AgendaDragRefusal> = new Set([
  "resourceReadOnly",
  "resourceNotAllowed",
  "outOfRange",
  "tooShort",
  "tooLong",
]);

/** The day has business hours and none of them is open (a closed Sunday). */
function isClosedAllDay(deps: AgendaDragDeps, { day, row }: PlanRow): boolean {
  const hasHours =
    deps.options.value.businessHours.length > 0 ||
    (deps.resources.value.find((resource) => resource.id === row.resourceId)
      ?.businessHours?.length ?? 0) > 0;
  if (!hasHours) return false;
  const open = openIntervals(
    deps.hoursOn(weekdayOf(day), row.resourceId),
    deps.hoursOn(weekdayOf(addDays(day, -1)), row.resourceId),
  );
  return open.length === 0;
}

/** A refusal that holds for the rest of the day and row. */
const refusesRow = (
  deps: AgendaDragDeps,
  row: PlanRow,
  refusal: AgendaDragRefusal,
) =>
  ROW_REFUSALS.has(refusal) ||
  (refusal === "closed" && isClosedAllDay(deps, row));

/** A row of spots: one resource (or none) on one day. */
interface PlanRow {
  day: AgendaDayKey;
  row: Pick<AgendaDropTarget, "resourceId">;
}

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

/**
 * The rows a view plans on: its resources (the allowed ones) in a view of
 * resource rows or columns; elsewhere the item's own allowed resources, or
 * none.
 */
function plannedRows(
  deps: AgendaDragDeps,
  item: AgendaPendingItem,
): Array<Pick<AgendaDropTarget, "resourceId">> {
  const { type } = deps.view.value;
  const resources = deps.resources.value;
  const allowed = item.allowedResourceIds;
  const isEditable = (id: string) =>
    resources.find((resource) => resource.id === id)?.editable !== false;
  if ((type !== "resources" && type !== "timeline") || !resources.length) {
    if (!allowed?.length) return [{}];
    return allowed.filter(isEditable).map((resourceId) => ({ resourceId }));
  }
  return resources
    .filter((resource) => resource.editable !== false)
    .filter((resource) => !allowed || allowed.includes(resource.id))
    .map((resource) => ({ resourceId: resource.id }));
}

/**
 * The times of a day a timed item may start at, by the snap: from the
 * scroll time to the day's end, then the earlier shown hours.
 */
function plannedMinutes(deps: AgendaDragDeps): number[] {
  const options = deps.options.value;
  const view = deps.view.value;
  const first = parseTimeOfDay(view.dayStart, options.dayStartMinutes);
  const last =
    parseTimeOfDay(view.dayEnd, options.dayEndMinutes) || MINUTES_PER_DAY;
  const scroll = Math.min(Math.max(options.scrollMinutes, first), last);
  const step = Math.max(options.snapMinutes, 1);
  const from = (start: number, end: number) => {
    const minutes: number[] = [];
    for (let at = start; at < end; at += step) minutes.push(at);
    return minutes;
  };
  return [...from(scroll, last), ...from(first, scroll)];
}

/** Every spot of a day and row, in order. */
function rowSpots(
  deps: AgendaDragDeps,
  item: AgendaPendingItem,
  { day, row }: PlanRow,
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

/** The rows of spots a pending item may be planned on, in the order they are tried. */
function planRows(deps: AgendaDragDeps, item: AgendaPendingItem): PlanRow[] {
  const rows = plannedRows(deps, item);
  return plannedDays(deps).flatMap((day) => rows.map((row) => ({ day, row })));
}

/** A spot checked: its placement, or why it is refused. */
interface PlanCheck {
  placement: AgendaPlacement;
  refusal: AgendaDragRefusal | null;
}

function checkSpot(
  deps: AgendaDragDeps,
  item: AgendaPendingItem,
  spot: AgendaDropTarget,
  rules: AgendaDropRules,
): PlanCheck {
  const source: AgendaDragSource = { kind: "external", item, origin: null };
  const placement = placeDrag(source, spot, viewDragConfig(deps));
  const refusal = checkDrop(
    {
      placement,
      copy: false,
      allowedResourceIds: item.allowedResourceIds,
      calendarId: item.calendarId,
      checkDuration: true,
    },
    rules,
  );
  return { placement, refusal };
}

/** The first allowed placement, or `null` when none fits. */
function firstPlacement(
  deps: AgendaDragDeps,
  item: AgendaPendingItem,
  rules: AgendaDropRules,
): AgendaPlacement | null {
  let checks = 0;
  for (const row of planRows(deps, item)) {
    for (const spot of rowSpots(deps, item, row)) {
      if (checks >= MAX_CHECKS) return null;
      checks += 1;
      const { placement, refusal } = checkSpot(deps, item, spot, rules);
      if (refusal === null) return placement;
      // A read-only calendar refuses everywhere; a row-wide refusal skips the row.
      if (refusal === "calendarReadOnly") return null;
      if (refusesRow(deps, row, refusal)) break;
    }
  }
  return null;
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
  let placement: AgendaPlacement | null;
  if (target) {
    const checked = checkSpot(deps, item, target, rules);
    placement = checked.refusal === null ? checked.placement : null;
  } else {
    placement = firstPlacement(deps, item, rules);
  }
  if (!placement) return false;
  const change = scheduleChange(item, placement, deps.options.value.timeZone);
  return deps.apply(change).catch(() => false);
}

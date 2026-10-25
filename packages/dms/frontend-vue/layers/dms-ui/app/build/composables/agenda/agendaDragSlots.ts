// The named-slot side of a drag: how many slots the pointer moved over the
// shown days, the slot a time falls in, and the instants a run of slots
// covers. The slot arithmetic itself is `agendaSlots`.

import type { AgendaDayKey, AgendaPlacement } from "./agendaModel";
import { zonedEpoch } from "./agendaTime";
import { shiftShownDay, slotPositionOf, slotSpan } from "./agendaSlots";
import type { AgendaSlotPosition, ParsedAgendaSlot } from "./agendaSlots";

/** What slot placements read of the options. */
export interface AgendaSlotConfig {
  timeZone: string;
  /** The block's named slots, parsed (`parseSlots`). */
  slots: ParsedAgendaSlot[];
  hiddenDays: number[];
}

/** Stops a walk over hidden days from running away on a bad option. */
const MAX_DAY_STEPS = 400;

/** Slots from one position to another, over the shown days. */
export function slotDistance(
  from: AgendaSlotPosition,
  to: AgendaSlotPosition,
  config: AgendaSlotConfig,
): number {
  const step = to.day >= from.day ? 1 : -1;
  let days = 0;
  let day = from.day;
  for (let guard = 0; day !== to.day && guard < MAX_DAY_STEPS; guard += 1) {
    day = shiftShownDay(day, step, config.hiddenDays);
    days += step;
  }
  return days * config.slots.length + to.slotIndex - from.slotIndex;
}

/** A run of `count` slots from a slot, on `resourceIds`. */
export function slotPlacement(
  first: AgendaSlotPosition,
  count: number,
  resourceIds: string[],
  config: AgendaSlotConfig,
): AgendaPlacement {
  const span = slotSpan(
    first,
    count,
    config.slots,
    config.timeZone,
    config.hiddenDays,
  );
  return { ...span, allDay: false, resourceIds };
}

/** The slot of a wall time of a day (the next one between two slots). */
export function slotOfTime(
  day: AgendaDayKey,
  minutes: number,
  config: AgendaSlotConfig,
): AgendaSlotPosition {
  const epoch = zonedEpoch(day, minutes, config.timeZone);
  return (
    slotPositionOf(epoch, config.slots, config.timeZone, config.hiddenDays) ?? {
      day,
      slotIndex: 0,
    }
  );
}

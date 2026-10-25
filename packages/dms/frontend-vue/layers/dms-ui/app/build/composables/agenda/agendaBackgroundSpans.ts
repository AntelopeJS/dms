// The shading the timeline and the year views lay behind events: the
// block's `backgrounds` (closed days, public holidays, highlighted periods)
// as instant spans with the days they cover and their style (from
// `agendaPaint`, closed hatched, holiday tinted).

import type { AgendaBackground } from "../../../types/full-agenda";
import type { AgendaDayKey } from "./agendaModel";
import { agendaBackgroundStyle, agendaColorCss } from "./agendaPaint";
import {
  addDays,
  dayStartEpoch,
  isDayKey,
  parseDay,
  zonedDayKey,
} from "./agendaTime";

/** A background as an instant span. */
export interface AgendaBackgroundSpan {
  start: number;
  end: number;
  /** First and last day it covers, inclusive. */
  startDay: AgendaDayKey;
  endDay: AgendaDayKey;
  style: Record<string, string>;
  /** Its colour as CSS, for a swatch (holiday warning, highlight info by default). */
  color: string;
  background: AgendaBackground;
}

const KIND_COLOR: Record<NonNullable<AgendaBackground["kind"]>, string> = {
  closed: "neutral",
  holiday: "warning",
  highlight: "info",
};

function daySpan(
  background: AgendaBackground,
  timeZone: string,
): Pick<AgendaBackgroundSpan, "start" | "end" | "startDay" | "endDay"> | null {
  const startDay = parseDay(background.start, timeZone);
  const endDay = parseDay(background.end ?? background.start, timeZone);
  if (!startDay || !endDay || endDay < startDay) return null;
  return {
    startDay,
    endDay,
    start: dayStartEpoch(startDay, timeZone),
    end: dayStartEpoch(addDays(endDay, 1), timeZone),
  };
}

function instantSpan(
  background: AgendaBackground,
  timeZone: string,
): Pick<AgendaBackgroundSpan, "start" | "end" | "startDay" | "endDay"> | null {
  const start = Date.parse(background.start);
  const end = Date.parse(background.end ?? background.start);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return {
    start,
    end,
    startDay: zonedDayKey(start, timeZone),
    endDay: zonedDayKey(end - 1, timeZone),
  };
}

/**
 * A background of the options as an instant span in the agenda's zone, or
 * `null` when its dates do not read. An all-day one (or one given as days)
 * covers its days, `end` inclusive.
 */
export function backgroundSpan(
  background: AgendaBackground,
  timeZone: string,
): AgendaBackgroundSpan | null {
  const byDay = background.allDay || isDayKey(background.start);
  const span = byDay
    ? daySpan(background, timeZone)
    : instantSpan(background, timeZone);
  if (!span) return null;
  const color = background.color ?? KIND_COLOR[background.kind ?? "highlight"];
  return {
    ...span,
    style: agendaBackgroundStyle(background),
    color: agendaColorCss(color as AgendaBackground["color"]),
    background,
  };
}

/** Every background that reads, as spans. */
export function backgroundSpans(
  backgrounds: readonly AgendaBackground[],
  timeZone: string,
): AgendaBackgroundSpan[] {
  return backgrounds
    .map((background) => backgroundSpan(background, timeZone))
    .filter((span): span is AgendaBackgroundSpan => span !== null);
}

/** A background applies to a resource row (`null`: a row of no resource). */
export function backgroundAppliesTo(
  span: AgendaBackgroundSpan,
  resourceId: string | null,
): boolean {
  const ids = span.background.resourceIds;
  if (!ids?.length) return true;
  return resourceId !== null && ids.includes(resourceId);
}

/** The style of the hours outside business hours (shaded, not hatched). */
export const CLOSED_HOURS_STYLE: Record<string, string> = {
  backgroundColor: "var(--ui-bg-elevated)",
};

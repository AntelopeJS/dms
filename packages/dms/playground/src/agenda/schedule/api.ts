import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  AgendaData,
  AgendaEvent,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { eventsFor, readAgendaQuery } from "../query";
import { readAgendaSave } from "../save";
import { AgendaStore, type AgendaState } from "../store";
import {
  addDays,
  currentWeek,
  dayOf,
  isoWeekOf,
  minutesBetween,
  mondayOf,
  todayKey,
} from "../time";
import { personOf, SCHEDULE_GROUPS, seedSchedule } from "./data";
import { AGENDA_SCHEDULE_API, PageAgendaSchedule } from "./page";
import { decorateShift, refuseShift, scheduleNotices } from "./rules";

const LONG_SHIFT_MINUTES = 360;
const LONG_SHIFT_PAUSE = 60;
const LAST_WEEKDAY = 6;

/** A new shift takes its person's home store, and a break past 6 hours. */
function completeShift(shift: AgendaEvent): AgendaEvent {
  const person = personOf(shift.resourceIds?.[0]);
  const length = shift.end ? minutesBetween(shift.start, shift.end) : 0;
  return {
    ...shift,
    calendarId: person?.role,
    data: {
      ...(person && { store: person.home }),
      pause: length > LONG_SHIFT_MINUTES ? LONG_SHIFT_PAUSE : 0,
      note: "",
      ...shift.data,
    },
  };
}

const store = new AgendaStore(seedSchedule, {
  idPrefix: "shift",
  anchor: currentWeek,
  refuse: refuseShift,
  complete: completeShift,
  decorate: decorateShift,
});

function stateNow(): AgendaState {
  return { events: store.events, pending: store.pending };
}

/** The days a save's notices cover: the ones it was sent from, else this week. */
function noticeRange(from: string, to: string): [string, string] {
  if (from && to) return [from, to];
  const monday = mondayOf(todayKey());
  return [monday, addDays(monday, LAST_WEEKDAY)];
}

/**
 * The routes of the "Store schedule" demo: a week of shifts per person, the
 * labour checks of the days shown as notices, the staged changes written
 * together (a closed store, a person's other store or two shifts at once
 * refused), and the publication of the week.
 */
export class AgendaScheduleController extends Controller(AGENDA_SCHEDULE_API) {
  @AuthUserWithPermission(PageAgendaSchedule)
  declare user: User;

  @Get("events")
  list(@Context() ctx: RequestContext): AgendaData {
    const query = readAgendaQuery(ctx.url.searchParams);
    return {
      events: store.answer(eventsFor(store.events, query)),
      resourceGroups: SCHEDULE_GROUPS,
      notices: scheduleNotices(stateNow(), query.from, query.to),
    };
  }

  @Post("save")
  save(@JSONBody() body: AgendaSaveRequest): AgendaSaveResponse {
    const input = readAgendaSave(body);
    const response = store.save(input);
    const [from, to] = noticeRange(input.from, input.to);
    return { ...response, notices: scheduleNotices(stateNow(), from, to) };
  }

  @Post("publish")
  publish(@Context() ctx: RequestContext) {
    const params = ctx.url.searchParams;
    const [from, to] = noticeRange(
      params.get("from") ?? "",
      params.get("to") ?? "",
    );
    const people = new Set(
      store.events
        .filter(
          (shift) => dayOf(shift.start) >= from && dayOf(shift.start) <= to,
        )
        .map((shift) => shift.resourceIds?.[0]),
    );
    return {
      message: `Planning de la semaine ${isoWeekOf(from)} envoyé à ${people.size} collaborateurs`,
    };
  }

  @Post("reset")
  reset() {
    store.reset();
    return { message: "Semaine remise à zéro" };
  }
}

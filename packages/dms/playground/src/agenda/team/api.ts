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
import { AgendaStore } from "../store";
import { dayOf, isDayKey, minutesOfDay } from "../time";
import { seedTeam } from "./data";
import {
  AGENDA_TEAM_API,
  PageAgendaTeam,
  TEAM_DAY_END,
  TEAM_DAY_START,
} from "./page";

const MINUTES_PER_HOUR = 60;

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

const OPENS = minutesOf(TEAM_DAY_START);
const CLOSES = minutesOf(TEAM_DAY_END);

function endsAfterClosing(event: AgendaEvent): boolean {
  if (!event.end) return false;
  const nextDay = dayOf(event.end) !== dayOf(event.start);
  return nextDay
    ? minutesOfDay(event.end) > 0
    : minutesOfDay(event.end) > CLOSES;
}

/**
 * Why a meeting may not be written: it needs a title, an end after its
 * start, and to sit within the office hours the agenda shows.
 */
function refuseMeeting(event: AgendaEvent): string | undefined {
  if (!event.title.trim()) return "Donne un titre à l'événement.";
  if (event.allDay || isDayKey(event.start)) return undefined;
  if (event.end && Date.parse(event.end) <= Date.parse(event.start)) {
    return "L'événement se termine avant de commencer.";
  }
  if (minutesOfDay(event.start) < OPENS || endsAfterClosing(event)) {
    return `Les réunions se tiennent entre ${TEAM_DAY_START} et ${TEAM_DAY_END}.`;
  }
  return undefined;
}

const store = new AgendaStore(seedTeam, {
  idPrefix: "team",
  refuse: refuseMeeting,
  complete: (event) => ({ ...event, calendarId: event.calendarId ?? "design" }),
});

/**
 * The routes of the "Team calendar" demo: the meetings of five calendars,
 * searched on the server; the save writes each change, refusing a meeting
 * without a title or outside office hours, and splits an occurrence off the
 * weekday standup.
 */
export class AgendaTeamController extends Controller(AGENDA_TEAM_API) {
  @AuthUserWithPermission(PageAgendaTeam)
  declare user: User;

  @Get("events")
  list(@Context() ctx: RequestContext): AgendaData {
    const query = readAgendaQuery(ctx.url.searchParams);
    return { events: store.answer(eventsFor(store.events, query)) };
  }

  @Post("save")
  save(@JSONBody() body: AgendaSaveRequest): AgendaSaveResponse {
    return store.save(readAgendaSave(body));
  }

  @Post("reset")
  reset() {
    store.reset();
    return { message: "Agenda remis à zéro" };
  }
}

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
import { AgendaStore, type RuleContext } from "../store";
import { DEMO_TIME_ZONE, eventDays, timeOf } from "../time";
import {
  READ_ONLY_STORE,
  ROSTER_FIRST_DAY,
  ROSTER_GROUPS,
  ROSTER_LAST_DAY,
  seedRoster,
  shiftHours,
  storeOfPerson,
} from "./data";
import { AGENDA_ROSTER_API, PageAgendaRoster } from "./page";

function sameDays(event: AgendaEvent, other: AgendaEvent): boolean {
  const days = eventDays(event.start, event.end, event.allDay);
  const others = eventDays(other.start, other.end, other.allDay);
  return days.from <= others.to && others.from <= days.to;
}

/**
 * Why a prestation may not be written: Luxembourg plans its own staff, the
 * roster covers the published weeks only, and a person has one prestation
 * a day.
 */
function refusePrestation(
  event: AgendaEvent,
  { state, before }: RuleContext,
): string | undefined {
  const person = event.resourceIds?.[0] ?? "";
  const touched = [person, ...(before?.resourceIds ?? [])];
  if (touched.some((id) => storeOfPerson(id) === READ_ONLY_STORE)) {
    return "Le planning de Luxembourg est fait par le bureau de Luxembourg.";
  }
  const days = eventDays(event.start, event.end, event.allDay);
  if (days.from < ROSTER_FIRST_DAY || days.to > ROSTER_LAST_DAY) {
    return "Le planning publié couvre les semaines 40 à 42 : du 28 septembre au 18 octobre.";
  }
  const clash = state.events.find(
    (other) =>
      other.id !== event.id &&
      other.resourceIds?.[0] === person &&
      sameDays(event, other),
  );
  return clash
    ? `Cette personne a déjà une prestation ce jour-là (${titledByHours(clash).title}).`
    : undefined;
}

/**
 * A shift is titled by its hours ("09:30–18:30"), kept right after a move or
 * a resize; the prestation type is its calendar. Absences keep their type.
 */
function titledByHours(event: AgendaEvent): AgendaEvent {
  if (event.calendarId !== "travail" || event.allDay || !event.end) {
    return event;
  }
  return {
    ...event,
    title: shiftHours(
      timeOf(event.start, DEMO_TIME_ZONE),
      timeOf(event.end, DEMO_TIME_ZONE),
    ),
  };
}

const store = new AgendaStore(seedRoster, {
  idPrefix: "roster",
  refuse: refusePrestation,
  complete: (event) => ({
    ...event,
    calendarId: event.calendarId ?? "travail",
  }),
  decorate: titledByHours,
});

/**
 * The routes of the "Staff roster" demo: three fixed weeks of prestations
 * per person; the save refuses Luxembourg's rows, a day outside the
 * published weeks, and a second prestation on a person's day.
 */
export class AgendaRosterController extends Controller(AGENDA_ROSTER_API) {
  @AuthUserWithPermission(PageAgendaRoster)
  declare user: User;

  @Get("events")
  list(@Context() ctx: RequestContext): AgendaData {
    const query = readAgendaQuery(ctx.url.searchParams);
    return {
      events: store.answer(eventsFor(store.events, query)),
      resourceGroups: ROSTER_GROUPS,
    };
  }

  @Post("save")
  save(@JSONBody() body: AgendaSaveRequest): AgendaSaveResponse {
    return store.save(readAgendaSave(body));
  }

  @Post("reset")
  reset() {
    store.reset();
    return { message: "Planning remis à l'état publié" };
  }
}

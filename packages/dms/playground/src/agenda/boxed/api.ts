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
import { eventInRange, eventsFor, readAgendaQuery } from "../query";
import { actionId, missing, readAgendaSave } from "../save";
import { AgendaStore } from "../store";
import {
  addDays,
  currentWeek,
  dayOf,
  isDayKey,
  timeOf,
  weekdayOf,
  zonedInstant,
} from "../time";
import { BOXED_LOCATIONS, markedDone, seedBoxed } from "./data";
import { AGENDA_BOXED_API, BOXED_FACET_FIELDS, PageAgendaBoxed } from "./page";

const DAYS_PER_WEEK = 7;
const SUNDAY = 0;
const PLACES = new Set(BOXED_LOCATIONS.map((option) => option.value));

/**
 * Why a meeting may not be written: the agency is closed on Sundays, and a
 * meeting takes place in one of its places.
 */
function refuseMeeting(event: AgendaEvent): string | undefined {
  if (!event.title.trim()) return "Donnez un objet au rendez-vous.";
  if (weekdayOf(dayOf(event.start)) === SUNDAY) {
    return "L'agence est fermée le dimanche.";
  }
  if (event.location && !PLACES.has(event.location)) {
    return `Lieu inconnu : ${event.location}. Choisissez Liège, Namur, Bruxelles ou Visio.`;
  }
  return undefined;
}

const store = new AgendaStore(seedBoxed, {
  idPrefix: "boxed",
  anchor: currentWeek,
  refuse: refuseMeeting,
  complete: (event) => ({
    ...event,
    calendarId: event.calendarId ?? "rdv",
    data: { client: "", done: false, ...event.data },
  }),
});

function nextWeek(event: AgendaEvent, id: string): AgendaEvent {
  /**
   * Seven days later at the same wall time: a week across the end of
   * summer time is 169 hours, not 168.
   */
  const shift = (value: string) =>
    isDayKey(value)
      ? addDays(value, DAYS_PER_WEEK)
      : zonedInstant(addDays(dayOf(value), DAYS_PER_WEEK), timeOf(value));
  return {
    ...event,
    id,
    start: shift(event.start),
    end: event.end && shift(event.end),
    muted: undefined,
    badges: undefined,
    data: { ...event.data, done: false },
  };
}

/**
 * The routes of the "Sales agenda" demo: meetings filtered on the server by
 * place and calendar, written by the save (no meeting on a Sunday, a place
 * the agency knows), marked as done or copied a week later by the event
 * actions, summed up by the toolbar's action.
 */
export class AgendaBoxedController extends Controller(AGENDA_BOXED_API) {
  @AuthUserWithPermission(PageAgendaBoxed)
  declare user: User;

  @Get("events")
  list(@Context() ctx: RequestContext): AgendaData {
    const query = readAgendaQuery(ctx.url.searchParams);
    return {
      events: store.answer(eventsFor(store.events, query, BOXED_FACET_FIELDS)),
    };
  }

  @Post("save")
  save(@JSONBody() body: AgendaSaveRequest): AgendaSaveResponse {
    return store.save(readAgendaSave(body));
  }

  @Post("done")
  done(@Context() ctx: RequestContext) {
    const event = store.find(actionId(ctx.url.searchParams));
    if (!event) throw missing("Ce rendez-vous n'existe plus.");
    store.put(markedDone(event));
    return { message: `« ${event.title} » marqué comme fait` };
  }

  @Post("duplicate")
  duplicate(@Context() ctx: RequestContext) {
    const event = store.find(actionId(ctx.url.searchParams));
    if (!event) throw missing("Ce rendez-vous n'existe plus.");
    const copy = nextWeek(event, store.nextId());
    store.put(copy);
    return { message: `« ${event.title} » copié au ${dayOf(copy.start)}` };
  }

  @Post("recap")
  recap(@Context() ctx: RequestContext) {
    const params = ctx.url.searchParams;
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const shown = store.events.filter((event) =>
      eventInRange(event, { from, to }),
    );
    return {
      message: `Récapitulatif de ${shown.length} rendez-vous envoyé à l'équipe`,
    };
  }

  @Post("reset")
  reset() {
    store.reset();
    return { message: "Agenda remis à zéro" };
  }
}

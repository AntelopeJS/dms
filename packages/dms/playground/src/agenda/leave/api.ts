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
  AgendaBackground,
  AgendaData,
  AgendaEvent,
  AgendaNotice,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { badRequest } from "../../matrix/save";
import { eventsFor, readAgendaQuery } from "../query";
import { actionId, missing, readAgendaSave } from "../save";
import { AgendaStore, type AgendaState, type RuleContext } from "../store";
import { plainText } from "../text";
import { currentWeek, eventDays, todayKey } from "../time";
import {
  asRequest,
  belgianHolidays,
  DAY_HOURS,
  LEAVE_ENTITLEMENT_DAYS,
  leaveLabel,
  seedLeave,
  workingDays,
} from "./data";
import { AGENDA_LEAVE_API, PageAgendaLeave } from "./page";

const DAY_FORMAT = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function dayLabel(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T12:00:00Z`));
}

function daysOf(event: AgendaEvent): string[] {
  const days = eventDays(event.start, event.end, true);
  return workingDays(days.from, days.to);
}

/** "1 jour", "5 jours". */
function dayCount(count: number): string {
  return `${count} jour${Math.abs(count) > 1 ? "s" : ""}`;
}

function isRefused(event: AgendaEvent): boolean {
  return event.status === "cancelled";
}

/** Leave days taken or approved this year, requests left out. */
function leaveTaken(events: AgendaEvent[], exceptId?: string): number {
  return events
    .filter(
      (event) =>
        event.calendarId === "conge" &&
        event.id !== exceptId &&
        event.data?.request !== true &&
        !isRefused(event),
    )
    .reduce((total, event) => total + daysOf(event).length, 0);
}

function overlapping(
  event: AgendaEvent,
  events: AgendaEvent[],
): AgendaEvent | undefined {
  const days = eventDays(event.start, event.end, true);
  return events.find((other) => {
    if (other.id === event.id || isRefused(other)) return false;
    const others = eventDays(other.start, other.end, true);
    return days.from <= others.to && others.from <= days.to;
  });
}

/**
 * Why an absence may not be written: it must cover a working day, not
 * overlap another one, and leave must fit in what is left of the year's.
 */
function refuseAbsence(
  event: AgendaEvent,
  { state }: RuleContext,
): string | undefined {
  const days = daysOf(event);
  if (!days.length) {
    return "Ces jours sont fériés ou de week-end : rien à encoder.";
  }
  const clash = overlapping(event, state.events);
  if (clash) {
    const span = eventDays(clash.start, clash.end, true);
    return `Ces jours chevauchent une absence déjà encodée (${clash.title}, du ${dayLabel(span.from)} au ${dayLabel(span.to)}).`;
  }
  if (event.calendarId !== "conge") return undefined;
  const left = LEAVE_ENTITLEMENT_DAYS - leaveTaken(state.events, event.id);
  return days.length > left
    ? `Solde insuffisant : ${dayCount(left)} de congé restant(s), ${dayCount(days.length)} demandé(s).`
    : undefined;
}

/** A new absence is a request, all-day, titled by its type. */
function completeAbsence(event: AgendaEvent): AgendaEvent {
  const type = event.calendarId ?? "conge";
  const note = plainText(event.data?.note);
  return asRequest({
    ...event,
    allDay: true,
    calendarId: type,
    title: leaveLabel(type),
    short: DAY_HOURS,
    subtitle: note || undefined,
  });
}

const store = new AgendaStore(seedLeave, {
  idPrefix: "leave",
  /**
   * The seed is the year's absences and next weeks' requests: a new year
   * or a new week reseeds it.
   */
  anchor: () => `${todayKey().slice(0, 4)}:${currentWeek()}`,
  refuse: refuseAbsence,
  complete: completeAbsence,
  decorate: (event) => ({ ...event, title: leaveLabel(event.calendarId) }),
});

function holidaysOf(from: string, to: string): AgendaBackground[] {
  const first = Number(from.slice(0, 4));
  const last = Number(to.slice(0, 4));
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  return years.flatMap(belgianHolidays);
}

function leaveNotices(state: AgendaState): AgendaNotice[] {
  const left = LEAVE_ENTITLEMENT_DAYS - leaveTaken(state.events);
  const waiting = state.events.filter(
    (event) => event.data?.request === true && !isRefused(event),
  );
  const balance: AgendaNotice = {
    id: "balance",
    tone: left > 0 ? "info" : "warning",
    message: `Solde congés : ${dayCount(left)} restant(s) sur ${LEAVE_ENTITLEMENT_DAYS}`,
  };
  return [
    ...waiting.map((event) => ({
      id: `request-${event.id}`,
      tone: "warning" as const,
      message: `${event.title} du ${dayLabel(eventDays(event.start, event.end, true).from)} à valider`,
      eventId: event.id,
    })),
    balance,
  ];
}

const DECISIONS = new Set(["accept", "refuse"]);

/**
 * The routes of the "Leave" demo: a person's absences of the year with the
 * public holidays as backgrounds, new absences written as requests (a
 * working day, no overlap, within the leave balance), accepted or refused
 * by the event actions.
 */
export class AgendaLeaveController extends Controller(AGENDA_LEAVE_API) {
  @AuthUserWithPermission(PageAgendaLeave)
  declare user: User;

  @Get("events")
  list(@Context() ctx: RequestContext): AgendaData {
    const query = readAgendaQuery(ctx.url.searchParams);
    const state = { events: store.events, pending: [] };
    return {
      events: store.answer(eventsFor(store.events, query)),
      backgrounds: holidaysOf(query.from, query.to),
      notices: leaveNotices(state),
    };
  }

  @Post("save")
  save(@JSONBody() body: AgendaSaveRequest): AgendaSaveResponse {
    const response = store.save(readAgendaSave(body));
    if (response.confirm) return response;
    return {
      ...response,
      notices: leaveNotices({ events: store.events, pending: [] }),
    };
  }

  @Post("decide")
  decide(@Context() ctx: RequestContext) {
    const params = ctx.url.searchParams;
    const decision = params.get("decision") ?? "";
    if (!DECISIONS.has(decision))
      throw badRequest("Expected decision=accept|refuse.");
    const event = store.find(actionId(params));
    if (!event) throw missing("Cette demande n'existe plus.");
    const accepted = decision === "accept";
    store.put({
      ...event,
      status: accepted ? "confirmed" : "cancelled",
      badges: accepted
        ? undefined
        : [{ label: "Refusée", tone: "error", icon: "i-ph-x" }],
      data: { ...event.data, request: false },
    });
    return { message: accepted ? "Demande acceptée" : "Demande refusée" };
  }

  @Post("reset")
  reset() {
    store.reset();
    return { message: "Année remise à zéro" };
  }
}

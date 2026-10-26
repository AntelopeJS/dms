import type { AgendaEvent } from "@antelopejs/interface-dms/base/full-agenda-types";
import type { JsonValue } from "@antelopejs/interface-dms/base/types/json";
import { z } from "zod";
import { badRequest } from "../matrix/save";
import { addDays, dayOf, eventDays } from "./time";

const FACET_PREFIX = "facet_";
const LIST_SEPARATOR = ",";
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_VALUE = z.string();
const SCALAR_VALUE = z.union([z.string(), z.number(), z.boolean()]);

/**
 * What a FullAgenda sends its `fetchUrl`: the first and last day shown, the
 * view, the zone it draws in, and its search, shown calendars (under
 * `legend.serverFilter`) and facets when they are set.
 */
export interface AgendaQuery {
  from: string;
  to: string;
  view?: string;
  tz?: string;
  /** Lower-cased and trimmed; empty when there is no search. */
  search: string;
  /** The calendars shown; absent when the block does not filter on the server. */
  calendars?: string[];
  facets: FacetPicks;
}

/** The values picked in each facet, by facet id. */
export interface FacetPicks {
  [facetId: string]: string[];
}

/** The event field each facet of a page filters on, by facet id. */
export interface FacetFields {
  [facetId: string]: string;
}

function readList(value: string | null): string[] {
  return (value ?? "").split(LIST_SEPARATOR).filter(Boolean);
}

function readFacets(params: URLSearchParams): FacetPicks {
  const facets: FacetPicks = {};
  params.forEach((value, key) => {
    if (!key.startsWith(FACET_PREFIX)) return;
    const picked = readList(value);
    if (picked.length) facets[key.slice(FACET_PREFIX.length)] = picked;
  });
  return facets;
}

function readDay(params: URLSearchParams, key: string): string {
  const value = params.get(key) ?? "";
  if (!DAY_PATTERN.test(value)) {
    throw badRequest(`Expected ${key}=YYYY-MM-DD, the days the agenda shows.`);
  }
  return value;
}

/**
 * Parses the query string a FullAgenda sends its route; `from` and `to` are
 * required, as the block always sends them: a call without them is a 400.
 */
export function readAgendaQuery(params: URLSearchParams): AgendaQuery {
  const calendars = params.get("calendars");
  return {
    from: readDay(params, "from"),
    to: readDay(params, "to"),
    view: params.get("view") || undefined,
    tz: params.get("tz") || undefined,
    search: (params.get("q") ?? "").trim().toLowerCase(),
    calendars: calendars === null ? undefined : readList(calendars),
    facets: readFacets(params),
  };
}

/**
 * Whether an event shows in the days asked for, days of the zone the agenda
 * draws in (`tz`, the demo zone without it): an event at 01:00 in Brussels
 * is the evening before for a reader in New York. A recurring series is
 * answered once it has started, by the days of its own zone: the block
 * expands it for the days it draws.
 */
export function eventInRange(
  event: AgendaEvent,
  query: Pick<AgendaQuery, "from" | "to" | "tz">,
): boolean {
  if (event.recurrence) {
    const until = event.recurrence.until;
    const first = dayOf(event.start, event.recurrence.timeZone);
    /** A day of slack each side: the series' days are not the reader's. */
    return (
      first <= addDays(query.to, 1) &&
      (!until || until >= addDays(query.from, -1))
    );
  }
  const days = eventDays(event.start, event.end, event.allDay, query.tz);
  return days.from <= query.to && days.to >= query.from;
}

/** One value or several of an event's field, as a facet reads it. */
export function eventField(event: AgendaEvent, field: string): string[] {
  const builtIn = new Map<string, JsonValue | undefined>([
    ["calendarId", event.calendarId],
    ["resourceIds", event.resourceIds],
    ["location", event.location],
    ["status", event.status],
  ]);
  const value = builtIn.has(field) ? builtIn.get(field) : event.data?.[field];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    const scalar = SCALAR_VALUE.safeParse(item);
    return scalar.success ? [String(scalar.data)] : [];
  });
}

function searchableTexts(event: AgendaEvent): string[] {
  const data = Object.values(event.data ?? {}).flatMap((value) => {
    const text = TEXT_VALUE.safeParse(value);
    return text.success ? [text.data] : [];
  });
  return [
    event.title,
    event.subtitle ?? "",
    event.location ?? "",
    event.description ?? "",
    ...data,
  ];
}

/**
 * Whether an event passes the search, the calendars shown and the facets.
 * `facetFields` maps each facet id the page declares to the event field it
 * filters on.
 */
export function eventMatches(
  event: AgendaEvent,
  query: AgendaQuery,
  facetFields: FacetFields = {},
): boolean {
  if (query.calendars && !query.calendars.includes(event.calendarId ?? "")) {
    return false;
  }
  const facetsPass = Object.entries(query.facets).every(([id, picked]) => {
    const field = facetFields[id];
    if (!field) return true;
    return eventField(event, field).some((value) => picked.includes(value));
  });
  if (!facetsPass) return false;
  if (!query.search) return true;
  return searchableTexts(event).some((text) =>
    text.toLowerCase().includes(query.search),
  );
}

/** The events of a list that show for a query: in range and matching. */
export function eventsFor(
  events: AgendaEvent[],
  query: AgendaQuery,
  facetFields?: FacetFields,
): AgendaEvent[] {
  return events.filter(
    (event) =>
      eventInRange(event, query) && eventMatches(event, query, facetFields),
  );
}

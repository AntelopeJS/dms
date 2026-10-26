// What the legend, the search and the facets leave on screen, and the
// counts the legend shows.

import type {
  AgendaEvent,
  AgendaFacet,
  AgendaResource,
} from "../../../types/full-agenda";
import type { AgendaOccurrence } from "./agendaModel";

/** The choices picked per facet id; an empty list filters nothing. */
export type AgendaFacetValues = Record<string, string[]>;

const RESOURCE_FIELD = "resourceIds";
const TAG_PATTERN = /<[^>]*>/g;
const DIACRITICS = /[̀-ͯ]/g;

/** Text as a search compares it: lower case, accents and HTML tags left out. */
export function searchText(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(TAG_PATTERN, " ")
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase();
}

/** Whether an event's title, subtitle, place or description holds every word of `query`. */
export function matchesSearch(event: AgendaEvent, query: string): boolean {
  const words = searchText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [
    event.title,
    event.subtitle,
    event.location,
    event.description,
  ]
    .map(searchText)
    .join(" ");
  return words.every((word) => haystack.includes(word));
}

/** The values of an event a facet reads: a field of its own, else of its `data`. */
export function facetFieldValues(event: AgendaEvent, field: string): string[] {
  const own: unknown = Object.entries(event).find(
    ([key]) => key === field,
  )?.[1];
  const value = own !== undefined ? own : event.data?.[field];
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

/** Whether an event holds one of the values picked in each facet (AND across facets, OR within one). */
export function matchesFacets(
  event: AgendaEvent,
  facets: AgendaFacet[],
  values: AgendaFacetValues,
): boolean {
  return facets.every((facet) => {
    const picked = values[facet.id] ?? [];
    if (!picked.length) return true;
    const held = facetFieldValues(event, facet.field);
    return held.some((value) => picked.includes(value));
  });
}

/** Whether the legend shows an event: an event of no calendar always shows. */
export function isCalendarShown(
  event: AgendaEvent,
  hidden: ReadonlySet<string>,
): boolean {
  return !event.calendarId || !hidden.has(event.calendarId);
}

/** What the filters of the toolbar and the legend hold. */
export interface AgendaFilterState {
  search: string;
  facets: AgendaFacet[];
  facetValues: AgendaFacetValues;
  hiddenCalendars: ReadonlySet<string>;
}

/** The occurrences the search and the facets keep, the legend not applied. */
export function filterBySearchAndFacets(
  occurrences: AgendaOccurrence[],
  state: AgendaFilterState,
): AgendaOccurrence[] {
  const hasFacets = state.facets.some(
    (facet) => (state.facetValues[facet.id] ?? []).length > 0,
  );
  if (!state.search.trim() && !hasFacets) return occurrences;
  return occurrences.filter(
    (occurrence) =>
      matchesSearch(occurrence.event, state.search) &&
      matchesFacets(occurrence.event, state.facets, state.facetValues),
  );
}

/** The occurrences per calendar id (the legend's counts). */
export function countByCalendar(
  occurrences: AgendaOccurrence[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const occurrence of occurrences) {
    const id = occurrence.event.calendarId;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** The occurrences the legend shows. */
export function filterByLegend(
  occurrences: AgendaOccurrence[],
  hidden: ReadonlySet<string>,
): AgendaOccurrence[] {
  if (!hidden.size) return occurrences;
  return occurrences.filter((occurrence) =>
    isCalendarShown(occurrence.event, hidden),
  );
}

/** The resources a facet over `resourceIds` keeps; every one without such a facet. */
export function filterResources(
  resources: AgendaResource[],
  facets: AgendaFacet[],
  values: AgendaFacetValues,
): AgendaResource[] {
  const picked = facets
    .filter((facet) => facet.field === RESOURCE_FIELD)
    .map((facet) => values[facet.id] ?? [])
    .filter((list) => list.length > 0);
  if (!picked.length) return resources;
  return resources.filter((resource) =>
    picked.every((list) => list.includes(resource.id)),
  );
}

/** The calendars hidden at first: the ones declared `hidden`. */
export function initiallyHiddenCalendars(
  calendars: Array<{ id: string; hidden?: boolean }>,
): Set<string> {
  return new Set(
    calendars
      .filter((calendar) => calendar.hidden)
      .map((calendar) => calendar.id),
  );
}

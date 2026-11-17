import type {
  AgendaEvent,
  AgendaFacet,
  AgendaResource,
} from "../../../types/full-agenda";
import type { AgendaOccurrence } from "./agendaModel";

/** The choices picked per facet id; an empty list filters nothing. */
export type AgendaFacetValues = Record<string, string[]>;

/** The values picked in the facet `id`, none when it has none. */
export const pickedValues = (values: AgendaFacetValues, id: string): string[] =>
  (Object.hasOwn(values, id) ? values[id] : undefined) ?? [];

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
    const picked = pickedValues(values, facet.id);
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
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) {
    const id = occurrence.event.calendarId;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
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
    .map((facet) => pickedValues(values, facet.id))
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

/**
 * The resources the resource filter hides among `resources`: the ids hidden that are listed, none when that would hide every one,
 * so a column always stays.
 */
export function hiddenAmong(
  resources: readonly AgendaResource[],
  hidden: ReadonlySet<string>,
): Set<string> {
  const listed = resources
    .map((resource) => resource.id)
    .filter((id) => hidden.has(id));
  return listed.length < resources.length ? new Set(listed) : new Set();
}

/** The hidden set after a click on `id`; the last resource shown cannot be hidden. */
export function toggleHiddenResource(
  hidden: ReadonlySet<string>,
  resources: readonly AgendaResource[],
  id: string,
): Set<string> {
  const current = hiddenAmong(resources, hidden);
  if (current.has(id)) {
    current.delete(id);
    return current;
  }
  const next = new Set(current).add(id);
  return hiddenAmong(resources, next).has(id) ? next : current;
}

/**
 * The resources a view with `resourcesAtOnce` shows:
 * the listed ones of `picked`, the newest `limit` at most, else the first
 * `limit` of `resources`.
 */
export function pickedAmong(
  resources: readonly AgendaResource[],
  picked: readonly string[],
  limit: number,
): string[] {
  const size = Math.max(1, Math.floor(limit));
  const listed = new Set(resources.map((resource) => resource.id));
  const kept = picked.filter((id) => listed.has(id));
  if (kept.length) return kept.slice(-size);
  return resources.slice(0, size).map((resource) => resource.id);
}

/**
 * The pick after a click on `id` in a view with `resourcesAtOnce`: a click on
 * a resource not picked adds it and drops the oldest ones past `limit`; a
 * click on a picked one unpicks it unless it is the only one.
 */
export function togglePickedResource(
  picked: readonly string[],
  resources: readonly AgendaResource[],
  limit: number,
  id: string,
): string[] {
  const current = pickedAmong(resources, picked, limit);
  if (current.includes(id))
    return current.length > 1 ? current.filter((held) => held !== id) : current;
  if (!resources.some((resource) => resource.id === id)) return current;
  return [...current, id].slice(-Math.max(1, Math.floor(limit)));
}

/** The resources of `resources` a pick leaves out: what the columns and events treat as hidden. */
export function hiddenOutsidePick(
  resources: readonly AgendaResource[],
  picked: readonly string[],
): Set<string> {
  const shown = new Set(picked);
  return new Set(
    resources.map((resource) => resource.id).filter((id) => !shown.has(id)),
  );
}

/** The occurrences the resource filter keeps: one whose every resource is hidden leaves, one of no resource stays. */
export function filterByResources(
  occurrences: AgendaOccurrence[],
  hidden: ReadonlySet<string>,
): AgendaOccurrence[] {
  if (!hidden.size) return occurrences;
  return occurrences.filter(
    (occurrence) =>
      !occurrence.resourceIds.length ||
      occurrence.resourceIds.some((id) => !hidden.has(id)),
  );
}

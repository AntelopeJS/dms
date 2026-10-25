// The agenda's state in the page URL. Every key is prefixed with the block's
// component id (`team.view=week`, `team.facet_room=A,B`), as the Matrix
// does: two agendas never read each other's keys, and none collides with
// the page's own query. A value at its default is left out.

import type { AgendaDayKey } from "./agendaModel";
import type { AgendaFacetValues } from "./agendaFilters";
import { isDayKey } from "./agendaTime";

const URL_KEYS = {
  view: "view",
  date: "date",
  search: "q",
  hidden: "hidden",
  event: "event",
} as const;

const FACET_PREFIX = "facet_";
const LIST_SEPARATOR = ",";

type QueryValue = string | null | undefined | Array<string | null>;

/** What an agenda keeps in the URL. */
export interface AgendaUrlState {
  view: string;
  date: AgendaDayKey;
  search: string;
  facets: AgendaFacetValues;
  /** The calendars unchecked in the legend. */
  hidden: string[];
}

/** The URL key of `key` for the agenda `componentId`. */
export function agendaUrlKey(componentId: string, key: string): string {
  return `${componentId}.${key}`;
}

/** The URL key of the event an agenda's details have open. */
export function agendaEventUrlKey(componentId: string): string {
  return agendaUrlKey(componentId, URL_KEYS.event);
}

function firstValue(value: QueryValue): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single ?? undefined;
}

const splitList = (text: string) => text.split(LIST_SEPARATOR).filter(Boolean);

/**
 * The state the URL gives the agenda, over `defaults`. Only views of
 * `viewIds` and facets of `facetIds` are read; a `hidden` key that is empty
 * shows every calendar.
 */
export function readAgendaUrlState(
  query: Record<string, QueryValue>,
  componentId: string,
  defaults: AgendaUrlState,
  viewIds: string[],
  facetIds: string[],
): AgendaUrlState {
  const read = (key: string) =>
    firstValue(query[agendaUrlKey(componentId, key)]);
  const view = read(URL_KEYS.view);
  const date = read(URL_KEYS.date);
  const hidden = read(URL_KEYS.hidden);
  const facets: AgendaFacetValues = { ...defaults.facets };
  for (const id of facetIds) {
    const value = read(`${FACET_PREFIX}${id}`);
    if (value) facets[id] = splitList(value);
  }
  return {
    view: view && viewIds.includes(view) ? view : defaults.view,
    date: isDayKey(date) ? date : defaults.date,
    search: read(URL_KEYS.search) ?? defaults.search,
    facets,
    hidden: hidden === undefined ? defaults.hidden : splitList(hidden),
  };
}

/** The open event the URL names. */
export function readAgendaUrlEvent(
  query: Record<string, QueryValue>,
  componentId: string,
): string | undefined {
  return firstValue(query[agendaEventUrlKey(componentId)]) || undefined;
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * The URL keys of the state, each with its value or `undefined` to remove it
 * (at its default). Every facet offered is listed, so one cleared leaves.
 */
export function agendaUrlEntries(
  componentId: string,
  state: AgendaUrlState,
  defaults: AgendaUrlState,
  facetIds: string[],
): Record<string, string | undefined> {
  const key = (name: string) => agendaUrlKey(componentId, name);
  const entries: Record<string, string | undefined> = {
    [key(URL_KEYS.view)]: state.view === defaults.view ? undefined : state.view,
    [key(URL_KEYS.date)]: state.date === defaults.date ? undefined : state.date,
    [key(URL_KEYS.search)]: state.search.trim() || undefined,
    [key(URL_KEYS.hidden)]: sameList(state.hidden, defaults.hidden)
      ? undefined
      : state.hidden.join(LIST_SEPARATOR),
  };
  for (const id of facetIds) {
    const values = state.facets[id] ?? [];
    entries[key(`${FACET_PREFIX}${id}`)] = values.length
      ? values.join(LIST_SEPARATOR)
      : undefined;
  }
  return entries;
}

/**
 * Writes the entries in the browser's URL in place: no visit and no history
 * entry. Nothing on a server render.
 */
export function writeAgendaUrlEntries(
  entries: Record<string, string | undefined>,
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url);
}

import { ref, watch, type Ref } from "vue";
import type {
  AgendaCalendar,
  AgendaResourceGroup,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import type { AgendaDayKey } from "./agendaModel";
import {
  initiallyHiddenCalendars,
  type AgendaFacetValues,
} from "./agendaFilters";
import {
  agendaUrlEntries,
  readAgendaUrlState,
  writeAgendaUrlEntries,
  type AgendaUrlState,
} from "./agendaUrlState";

/** What the URL gave the agenda as it opened. */
export interface AgendaInitialUrl {
  /** Absent when the agenda does not keep its state in the URL. */
  state?: AgendaUrlState;
  /** The URL names hidden calendars: the declared `hidden` ones do not apply. */
  namesHidden: boolean;
}

/** Reads the URL state once, as the agenda opens. */
export function readInitialAgendaUrl(
  raw: FullAgendaOptions,
  componentId: string,
  viewIds: string[],
  defaults: AgendaUrlState,
): AgendaInitialUrl {
  if (raw.urlState === false) return { namesHidden: false };
  const query = useDmsRoute().query as Record<string, string>;
  const facetIds = (raw.facets ?? []).map((facet) => facet.id);
  return {
    state: readAgendaUrlState(query, componentId, defaults, viewIds, facetIds),
    namesHidden: `${componentId}.hidden` in query,
  };
}

/** What the filters follow. */
export interface AgendaFilterSetup {
  raw: FullAgendaOptions;
  componentId: string;
  initial: AgendaInitialUrl;
  /** What the URL keeps besides the filters. */
  pickedViewId: Ref<string>;
  anchor: Ref<AgendaDayKey>;
  defaultViewId: () => string;
  defaultDay: () => AgendaDayKey;
}

/**
 * The search, facets, legend and folded resource groups of an agenda, kept
 * in the page URL with the view and the day (see `agendaUrlState`). A
 * calendar or a group declared hidden or collapsed starts so, even when
 * only the answer declares it.
 */
export function useAgendaFilterState(setup: AgendaFilterSetup) {
  const { raw, initial } = setup;
  const search = ref(initial.state?.search ?? "");
  const facetValues = ref<AgendaFacetValues>(initial.state?.facets ?? {});
  const declaredHidden = initiallyHiddenCalendars(raw.calendars ?? []);
  const hiddenCalendars = ref<Set<string>>(
    initial.namesHidden
      ? new Set(initial.state?.hidden ?? [])
      : new Set(declaredHidden),
  );
  const foldedGroups = ref<Set<string>>(new Set());

  // Calendars and groups the answer brings start as they declare.
  const seenCalendars = new Set<string>((raw.calendars ?? []).map((c) => c.id));
  const followCalendars = (calendars: () => AgendaCalendar[]) =>
    watch(
      calendars,
      (calendars) => {
        const added = calendars.filter(
          (calendar) => !seenCalendars.has(calendar.id),
        );
        added.forEach((calendar) => seenCalendars.add(calendar.id));
        const hidden = added.filter((calendar) => calendar.hidden);
        if (initial.namesHidden || !hidden.length) return;
        hidden.forEach((calendar) => declaredHidden.add(calendar.id));
        hiddenCalendars.value = new Set([
          ...hiddenCalendars.value,
          ...hidden.map((calendar) => calendar.id),
        ]);
      },
      { immediate: true },
    );
  const seenGroups = new Set<string>();
  const followGroups = (resourceGroups: () => AgendaResourceGroup[]) =>
    watch(
      resourceGroups,
      (groups) => {
        const added = groups.filter((group) => !seenGroups.has(group.id));
        added.forEach((group) => seenGroups.add(group.id));
        const collapsed = added.filter((group) => group.collapsed);
        if (!collapsed.length) return;
        foldedGroups.value = new Set([
          ...foldedGroups.value,
          ...collapsed.map((group) => group.id),
        ]);
      },
      { immediate: true },
    );

  if (raw.urlState !== false)
    keepInUrl(setup, { search, facetValues, hiddenCalendars }, declaredHidden);

  const toggle = (set: Ref<Set<string>>, id: string) => {
    const next = new Set(set.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set.value = next;
  };

  return {
    search,
    facetValues,
    hiddenCalendars,
    toggleCalendar: (calendarId: string) => toggle(hiddenCalendars, calendarId),
    foldedGroups,
    toggleGroup: (groupId: string) => toggle(foldedGroups, groupId),
    /** Follows the calendars and groups known (the block's and the answer's). */
    follow: (known: AgendaKnownLists) => {
      followCalendars(known.calendars);
      followGroups(known.resourceGroups);
    },
  };
}

/** The lists whose declared `hidden` / `collapsed` the filters take. */
export interface AgendaKnownLists {
  calendars: () => AgendaCalendar[];
  resourceGroups: () => AgendaResourceGroup[];
}

interface AgendaFilterRefs {
  search: Ref<string>;
  facetValues: Ref<AgendaFacetValues>;
  hiddenCalendars: Ref<Set<string>>;
}

/** Writes the view, day, search, facets and legend in the URL as they change. */
function keepInUrl(
  setup: AgendaFilterSetup,
  refs: AgendaFilterRefs,
  declaredHidden: Set<string>,
): void {
  const facetIds = (setup.raw.facets ?? []).map((facet) => facet.id);
  // With `periodScope`, the day is the selector's to keep.
  const keepsDay = !setup.raw.periodScope;
  watch(
    () => ({
      view: setup.pickedViewId.value,
      date: keepsDay ? setup.anchor.value : setup.defaultDay(),
      search: refs.search.value,
      facets: refs.facetValues.value,
      hidden: [...refs.hiddenCalendars.value],
    }),
    (state) =>
      writeAgendaUrlEntries(
        agendaUrlEntries(
          setup.componentId,
          state,
          {
            view: setup.defaultViewId(),
            date: setup.defaultDay(),
            search: "",
            facets: {},
            hidden: [...declaredHidden],
          },
          facetIds,
        ),
      ),
    { deep: true },
  );
}

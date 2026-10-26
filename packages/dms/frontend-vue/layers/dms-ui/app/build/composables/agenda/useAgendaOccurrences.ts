import { computed, type ComputedRef, type Ref } from "vue";
import type {
  AgendaBackground,
  AgendaBusinessHours,
  AgendaEvent,
  AgendaFacet,
} from "../../../types/full-agenda";
import type {
  AgendaOccurrence,
  AgendaRange,
  ResolvedAgendaOptions,
} from "./agendaModel";
import type { AgendaEditMark } from "./agendaChanges";
import { buildOccurrences } from "./agendaOccurrences";
import {
  countByCalendar,
  filterByLegend,
  filterBySearchAndFacets,
  filterResources,
  type AgendaFacetValues,
} from "./agendaFilters";
import { addDays, dayStartEpoch, parseDay, zonedDayKey } from "./agendaTime";
import type { AgendaDataSource } from "./useAgendaData";

const OPEN_ALL_DAY = "00:00";
const CLOSE_ALL_DAY = "24:00";
/** How far ahead "upcoming" looks in the events in hand. */
const UPCOMING_DAYS = 60;

/** The backgrounds touching the range's days. */
export function backgroundsIn(
  backgrounds: AgendaBackground[],
  from: string,
  to: string,
  timeZone: string,
): AgendaBackground[] {
  return backgrounds.filter((background) => {
    const first = parseDay(background.start, timeZone);
    if (!first) return false;
    const last = parseDay(background.end, timeZone) ?? first;
    return first <= to && last >= from;
  });
}

/** What the occurrences are built from. */
export interface AgendaOccurrenceSetup {
  options: ComputedRef<ResolvedAgendaOptions>;
  range: ComputedRef<AgendaRange>;
  source: AgendaDataSource;
  /** The events with the changes not written laid over them, and how each shows. */
  overlay: ComputedRef<{
    events: AgendaEvent[];
    marks: Map<string, AgendaEditMark>;
  }>;
  facets: AgendaFacet[];
  search: Ref<string>;
  facetValues: Ref<AgendaFacetValues>;
  hiddenCalendars: Ref<Set<string>>;
  /** The current instant (what "upcoming" starts from). */
  now: Ref<number>;
}

/**
 * The occurrences of the range (series expanded, changes shown), then the
 * ones the search and facets keep (the legend's counts), then the ones the
 * legend shows; the resources a facet keeps, the backgrounds of the range,
 * and the business hours of a day.
 */
export function useAgendaOccurrences(setup: AgendaOccurrenceSetup) {
  const { options, range, source } = setup;
  const calendarsById = computed(
    () =>
      new Map(
        source.calendars.value.map((calendar) => [calendar.id, calendar]),
      ),
  );
  const resourcesById = computed(
    () =>
      new Map(
        source.resources.value.map((resource) => [resource.id, resource]),
      ),
  );
  /** The occurrences of the events in hand over some days, every filter aside. */
  const occurrencesOver = (
    days: Pick<AgendaRange, "from" | "to" | "start" | "end">,
    shownDays?: ReadonlySet<string>,
  ) =>
    buildOccurrences(setup.overlay.value.events, {
      timeZone: options.value.timeZone,
      from: days.from,
      to: days.to,
      start: days.start,
      end: days.end,
      shownDays,
      defaultDurationMinutes: options.value.defaultDurationMinutes,
      editable: options.value.editable,
      dragMove: options.value.dragMove,
      dragResize: options.value.dragResize,
      detailsContainer: options.value.raw.details?.container ?? "drawer",
      calendars: calendarsById.value,
      resources: resourcesById.value,
      marks: setup.overlay.value.marks,
    });
  const inRange = computed(() =>
    occurrencesOver(
      range.value,
      new Set(range.value.days.map((day) => day.key)),
    ),
  );
  const searched = (occurrences: AgendaOccurrence[]) =>
    filterBySearchAndFacets(occurrences, {
      search: setup.search.value,
      facets: setup.facets,
      facetValues: setup.facetValues.value,
      hiddenCalendars: setup.hiddenCalendars.value,
    });
  const filtered = computed(() => searched(inRange.value));

  /** The occurrences of any days, from the events in hand, every filter applied. */
  function occurrencesIn(from: string, to: string): AgendaOccurrence[] {
    const timeZone = options.value.timeZone;
    const days = {
      from,
      to,
      start: dayStartEpoch(from, timeZone),
      end: dayStartEpoch(addDays(to, 1), timeZone),
    };
    return filterByLegend(
      searched(occurrencesOver(days)),
      setup.hiddenCalendars.value,
    );
  }

  /** Business hours of a resource (or the agenda's) on a weekday; none set: open all day. */
  function hoursOn(
    weekday: number,
    resourceId?: string,
  ): AgendaBusinessHours[] {
    const resource = resourceId
      ? resourcesById.value.get(resourceId)
      : undefined;
    const hours = resource?.businessHours ?? options.value.businessHours;
    if (!hours.length)
      return [{ days: [weekday], start: OPEN_ALL_DAY, end: CLOSE_ALL_DAY }];
    return hours.filter((entry) => entry.days.includes(weekday));
  }

  return {
    /** Every occurrence of the range, before the legend, the search and the facets (the drop rules). */
    rangeOccurrences: inRange,
    occurrencesIn,
    upcoming: computed(() => {
      const now = setup.now.value;
      const today = zonedDayKey(now, options.value.timeZone);
      return occurrencesIn(today, addDays(today, UPCOMING_DAYS)).filter(
        (occurrence) => occurrence.end > now,
      );
    }),
    occurrences: computed(() =>
      filterByLegend(filtered.value, setup.hiddenCalendars.value),
    ),
    calendarCounts: computed(() => countByCalendar(filtered.value)),
    resources: computed(() =>
      filterResources(
        source.resources.value,
        setup.facets,
        setup.facetValues.value,
      ),
    ),
    backgrounds: computed(() =>
      backgroundsIn(
        source.data.value.backgrounds ?? [],
        range.value.from,
        range.value.to,
        options.value.timeZone,
      ),
    ),
    hoursOn,
  };
}

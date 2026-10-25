import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import {
  useApiData,
  type UseApiDataOptions,
} from "#dms-core/app/composables/auth/useApiData";
import type {
  AgendaCalendar,
  AgendaChange,
  AgendaData,
  AgendaSaveResponse,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import { resolveUrlVariables } from "../../utils/urlVariables";
import { useRefreshTriggers } from "../blocks/useRefreshTriggers";
import type { AgendaRange, ResolvedAgendaView } from "./agendaModel";
import type { AgendaFacetValues } from "./agendaFilters";
import {
  agendaFetchQuery,
  applySaveAnswer,
  mergeById,
  type AgendaSeedOf,
} from "./agendaData";

const SEARCH_DEBOUNCE_MS = 300;

/** What the agenda reads its data with. */
export interface AgendaDataSetup {
  raw: FullAgendaOptions;
  routeParams: () => Record<string, string> | undefined;
  range: ComputedRef<AgendaRange>;
  view: ComputedRef<ResolvedAgendaView>;
  timeZone: () => string;
  search: Ref<string>;
  facetValues: Ref<AgendaFacetValues>;
  /** The calendars the legend shows (sent with `legend.serverFilter`). */
  shownCalendarIds: () => string[] | undefined;
  /** The state of the block's watch actions: a change reads again. */
  watchKey: () => string;
  /** The agenda knows its view (its width measured): reading waits for it. */
  isReady?: () => boolean;
}

/** A value that follows `source` once it holds still for `delay` ms. */
function useDebounced(source: Ref<string>, delay: number): Ref<string> {
  const settled = ref(source.value);
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(source, (value) => {
    clearTimeout(timer);
    timer = setTimeout(() => (settled.value = value), delay);
  });
  if (getCurrentScope()) onScopeDispose(() => clearTimeout(timer));
  return settled;
}

const EMPTY: AgendaData = { events: [] };

/**
 * The data of a FullAgenda: `staticData`, or `fetchUrl` read with the range,
 * view, zone, search (once typing pauses), shown calendars and facets, again
 * on each event of `realtimeTopic` and on the page's refreshes. A read in
 * progress keeps the previous data on screen. A save's answer is laid over
 * the data until the next read.
 */
export function useAgendaData(setup: AgendaDataSetup) {
  const { raw } = setup;
  const local = shallowRef<AgendaData | null>(raw.staticData ?? null);
  const route = useDmsRoute();
  const url = computed(() =>
    resolveUrlVariables(raw.fetchUrl, {
      routeParams: setup.routeParams(),
      routeQuery: route.query as Record<string, unknown>,
    }),
  );
  const search = useDebounced(setup.search, SEARCH_DEBOUNCE_MS);
  const query = () =>
    agendaFetchQuery({
      range: setup.range.value,
      viewId: setup.view.value.id,
      timeZone: setup.timeZone(),
      search: search.value,
      facetValues: setup.facetValues.value,
      calendars: setup.shownCalendarIds(),
    });

  /** The save answers laid over the data so far. */
  let writes = 0;
  let isLoading: ComputedRef<boolean> = computed(() => false);
  let error: ComputedRef<unknown> = computed(() => null);
  let refresh = async () => {};

  if (raw.fetchUrl) {
    const isReady = setup.isReady ?? (() => true);
    const loaded = useApiData<AgendaData>(
      () => (isReady() ? (url.value ?? null) : null),
      {
        method: raw.fetchUrlMethod as UseApiDataOptions<AgendaData>["method"],
        query,
        lazy: true,
        refreshOnPageRefresh: false,
        watch: [setup.watchKey],
      },
    );
    // A read started before the last write answers what was stored then:
    // it is dropped and read again, so a saved event does not jump back.
    let readFrom = writes;
    watch(
      () => loaded.status.value,
      (status) => {
        if (status === "pending") readFrom = writes;
      },
      { flush: "sync" },
    );
    // A new read replaces the data; until it lands, the last one stays.
    watch(
      () => loaded.data.value,
      (data) => {
        if (!data) return;
        if (readFrom < writes) {
          // Once per write: the read that follows is taken whatever it reports.
          readFrom = writes;
          void loaded.refresh();
          return;
        }
        local.value = data;
      },
      { immediate: true },
    );
    isLoading = computed(() => loaded.status.value === "pending");
    error = computed(() => loaded.error.value);
    refresh = async () => {
      await loaded.refresh();
    };
    useRefreshTriggers(raw.realtimeTopic, refresh);
  } else {
    watch(
      () => raw.staticData,
      (next) => (local.value = next ?? null),
    );
  }

  const data = computed<AgendaData>(() => local.value ?? EMPTY);
  const calendars = computed<AgendaCalendar[]>(() =>
    mergeById(raw.calendars, data.value.calendars),
  );

  return {
    data,
    /** Something was read (or given): an empty agenda is not one still loading. */
    hasData: computed(() => local.value !== null),
    isLoading,
    error,
    refresh,
    calendars,
    calendarGroups: computed(() => data.value.calendarGroups ?? []),
    resources: computed(() => mergeById(raw.resources, data.value.resources)),
    resourceGroups: computed(() => data.value.resourceGroups ?? []),
    /** Puts a save's answer on screen until the next read. */
    applyAnswer: (
      response: AgendaSaveResponse,
      written: AgendaChange[],
      seedOf?: AgendaSeedOf,
    ) => {
      writes += 1;
      local.value = applySaveAnswer(
        data.value,
        response,
        written,
        seedOf,
        setup.timeZone(),
      );
    },
  };
}

export type AgendaDataSource = ReturnType<typeof useAgendaData>;

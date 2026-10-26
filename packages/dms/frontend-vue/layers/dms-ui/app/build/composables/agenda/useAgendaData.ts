import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  useApiData,
  type UseApiDataOptions,
} from "#dms-core/app/composables/auth/useApiData";
import type {
  AgendaCalendar,
  AgendaChange,
  AgendaData,
  AgendaEvent,
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
  isSameRange,
  withoutRangeLists,
  type AgendaAnsweredRange,
  KEPT_ANSWER_LAYERS,
  layerAnswers,
  mergeById,
  type AgendaAnswerLayer,
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

/** The save answers laid over the data so far, the last ones kept. */
interface AgendaAnswers {
  writes: number;
  layers: AgendaAnswerLayer[];
}

/** Where reads are put on screen. */
interface AgendaReadTarget {
  local: ShallowRef<AgendaData | null>;
  answers: AgendaAnswers;
  timeZone: () => string;
  /** The range the reads are of. */
  range: () => AgendaAnsweredRange;
}

/**
 * Puts each read on screen, with the save answers made after it laid over
 * it: a read started before a write (or a week shown again from cache)
 * shows the write, and is read again once in the background.
 */
function keepReadsCurrent(
  loaded: ReturnType<typeof useApiData<AgendaData>>,
  keyOf: () => string,
  target: AgendaReadTarget,
): void {
  const { answers } = target;
  const readAt = new Map<string, number>();
  const reread = new Set<string>();
  let running: { key: string; from: number } | null = null;
  watch(
    () => loaded.status.value,
    (status) => {
      if (status === "pending")
        running = { key: keyOf(), from: answers.writes };
    },
    { flush: "sync" },
  );
  watch(
    () => loaded.data.value,
    (fresh) => {
      if (!fresh) return;
      const key = keyOf();
      const isRunning = loaded.status.value === "pending";
      if (running?.key === key && !isRunning) {
        readAt.set(key, running.from);
        running = null;
      }
      const from = readAt.get(key) ?? 0;
      target.local.value = layerAnswers(
        fresh,
        answers.layers,
        from,
        target.timeZone(),
        target.range(),
      );
      const mark = `${key}#${answers.writes}`;
      if (from >= answers.writes || isRunning || reread.has(mark)) return;
      reread.add(mark);
      void loaded.refresh();
    },
    { immediate: true },
  );
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

  const answers: AgendaAnswers = { writes: 0, layers: [] };
  const shownRange = (): AgendaAnsweredRange => ({
    from: setup.range.value.from,
    to: setup.range.value.to,
    view: setup.view.value.id,
  });
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
    keepReadsCurrent(
      loaded,
      () => `${url.value ?? ""}?${JSON.stringify(query())}`,
      { local, answers, timeZone: setup.timeZone, range: shownRange },
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
      /** The range the request was made for. */
      range?: AgendaAnsweredRange,
    ) => {
      const isShown = isSameRange(range, shownRange());
      // An answer for a range no longer shown keeps its lists to itself:
      // the range shown reads its own again.
      if (!isShown) void refresh();
      answers.writes += 1;
      const seeds = new Map(
        written
          .map((change) => [change.tempId ?? "", seedOf?.(change)] as const)
          .filter((entry): entry is [string, AgendaEvent] => Boolean(entry[1])),
      );
      answers.layers.push({
        seq: answers.writes,
        response,
        written,
        seeds,
        range,
      });
      if (answers.layers.length > KEPT_ANSWER_LAYERS) answers.layers.shift();
      local.value = applySaveAnswer(
        data.value,
        isShown ? response : withoutRangeLists(response),
        written,
        seedOf,
        setup.timeZone(),
      );
    },
  };
}

export type AgendaDataSource = ReturnType<typeof useAgendaData>;

import { usePageLive } from "../../../composables/live/usePageLive";
import type { RealtimeTopicHandler } from "#dms-core/app/composables/realtime/useUserRealtime";
import type { RealtimePresenceMap } from "./tableViewTypes";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewRowRealtime<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "configuration" | "rows" | "listState" | "props"
  >,
) {
  const {
    ROW_ID_DEFAULT_KEY,
    location,
    REALTIME_ROW_TOPIC_PREFIX,
    REALTIME_PRESENCE_TOPIC_PREFIX,
  } = scope.configuration;
  const { tableRows } = scope.rows;
  const { data } = scope.listState;
  const { props } = scope;
  const rowIdKey = props.rowIdKey ?? ROW_ID_DEFAULT_KEY;

  const realtimeLocation = tableRows.isSource ? undefined : location;
  const realtimeRowTopic = computed(() =>
    realtimeLocation
      ? `${REALTIME_ROW_TOPIC_PREFIX}${realtimeLocation}`
      : undefined,
  );
  const realtimePresenceTopic = computed(() =>
    realtimeLocation
      ? `${REALTIME_PRESENCE_TOPIC_PREFIX}${realtimeLocation}`
      : undefined,
  );

  const presenceByRow = ref<RealtimePresenceMap>({});
  const { user: realtimeUser } = useDmsUserSession();

  const getRowId = (row: T): string | undefined => {
    const value = row[rowIdKey];
    if (value === undefined || value === null) return undefined;
    return String(value);
  };

  const removeRowsLocal = (ids: string[]) => {
    if (!data.value?.results) return;
    const idSet = new Set(ids);
    const next = data.value.results.filter((row) => {
      const id = getRowId(row);
      return !id || !idSet.has(id);
    });
    data.value = { ...data.value, results: next };
  };

  const patchRowLocal = async (id: string) => {
    if (!data.value?.results) return;
    const idx = data.value.results.findIndex((row) => getRowId(row) === id);
    if (idx === -1) return;
    try {
      const fresh = await tableRows.getRow(id);
      if (!fresh) return;
      const next = [...data.value.results];
      next[idx] = fresh;
      data.value = { ...data.value, results: next };
    } catch (error) {
      console.warn("[realtime] failed to refetch updated row", id, error);
    }
  };
  return {
    removeRowsLocal,
    patchRowLocal,
    realtimeRowTopic,
    presenceByRow,
    realtimePresenceTopic,
    realtimeUser,
    getRowId,
    rowIdKey,
  };
}

export function useTableViewRowEvents<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "rowRealtime"
    | "rowCommands"
    | "refresh"
    | "displayComponent"
    | "footer"
  >,
) {
  const { REALTIME_EVENT_TYPE } = scope.configuration;
  const { removeRowsLocal, patchRowLocal, realtimeRowTopic } =
    scope.rowRealtime;
  const { deselectRows } = scope.rowCommands;
  const { refreshAll, refreshCounts, liveGate } = scope.refresh;
  const { isActiveDisplaySelfManaged } = scope.displayComponent;
  const { activeDisplayRef } = scope.footer;
  const realtimeEventHandlers: Record<
    Parameters<typeof gateRowEvent>[0],
    (ids: string[]) => void | Promise<void>
  > = {
    [REALTIME_EVENT_TYPE.DELETED]: (ids) => {
      removeRowsLocal(ids);

      deselectRows(ids);
      return refreshAll();
    },
    [REALTIME_EVENT_TYPE.CREATED]: () => refreshAll(),

    [REALTIME_EVENT_TYPE.UPDATED]: async (ids) => {
      if (isActiveDisplaySelfManaged.value) {
        await Promise.all([
          activeDisplayRef.value?.refresh?.(),
          refreshCounts(),
        ]);
        return;
      }
      await Promise.all([
        ...ids.map((id) => patchRowLocal(id)),
        refreshCounts(),
      ]);
    },
  };

  const { isEnabled: isPageLive, isPaused: isPagePaused } = usePageLive();
  const gateRowEvent = (
    type: string,
    ids: string[],
    event: Parameters<RealtimeTopicHandler>[0],
  ) => {
    if (type === REALTIME_EVENT_TYPE.DELETED && !isPagePaused.value) {
      deselectRows(ids);
    }
    liveGate.trigger(event);
  };

  useRealtimeTopic(realtimeRowTopic, (event) => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- RealtimeTopicHandler leaves payload values unknown; this existing row-topic consumer trusts server ids without validating them.
    const payload = event as { type: string; payload?: { ids?: string[] } };
    const handler = realtimeEventHandlers[payload.type];
    if (!handler) return;
    const ids = payload.payload?.ids ?? [];
    if (ids.length === 0 && payload.type !== REALTIME_EVENT_TYPE.CREATED)
      return;
    if (isPageLive.value) {
      gateRowEvent(payload.type, ids, event);
      return;
    }
    void handler(ids);
  });
  return {};
}

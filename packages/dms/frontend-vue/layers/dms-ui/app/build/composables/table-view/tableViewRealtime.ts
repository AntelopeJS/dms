import { usePageLive } from "../../../composables/live/usePageLive";
import {
  useUserRealtime,
  type RealtimeTopicHandler,
} from "#dms-core/app/composables/realtime/useUserRealtime";
import { isString } from "#dms-core/app/utils/type-check";
import { textOf } from "#dms-core/app/entries/utils/dataTypeValue";
import type { RealtimePresenceMap } from "./tableViewTypes";
import { detach } from "../detach";
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
  const { data, readOrder } = scope.listState;
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
    return textOf(value);
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

  const findRow = (id: string) =>
    data.value?.results.findIndex((row) => getRowId(row) === id) ?? -1;

  const patchRowLocal = async (id: string) => {
    if (findRow(id) === -1) return;
    readOrder.rows += 1;
    const read = readOrder.rows;
    const listRead = readOrder.lists;
    try {
      const fresh = await tableRows.getRow(id);
      if (!fresh || readOrder.lists !== listRead) return;
      if (read < (readOrder.applied.get(id) ?? 0)) return;
      const idx = findRow(id);
      if (!data.value || idx === -1) return;
      readOrder.applied.set(id, read);
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
    | "listState"
    | "rowRealtime"
    | "rowCommands"
    | "refresh"
    | "displayComponent"
    | "footer"
  >,
) {
  const { REALTIME_EVENT_TYPE } = scope.configuration;
  const { isListLoading } = scope.listState;
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
      if (isListLoading.value) {
        await refreshAll();
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
    if (!("type" in event)) return;
    const handler = realtimeEventHandlers[event.type];
    if (!handler) return;
    const rawIds = event.payload?.ids;
    const ids = Array.isArray(rawIds) ? rawIds.filter(isString) : [];
    if (ids.length === 0 && event.type !== REALTIME_EVENT_TYPE.CREATED) return;
    if (isPageLive.value) {
      gateRowEvent(event.type, ids, event);
      return;
    }
    detach(Promise.resolve(handler(ids)));
  });

  watch(useUserRealtime().pageTopics, (topics) => {
    if (realtimeRowTopic.value && topics.length > 0) liveGate.owe();
  });
  return {};
}

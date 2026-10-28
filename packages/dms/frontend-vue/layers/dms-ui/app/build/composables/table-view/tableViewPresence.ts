import type {
  RealtimePresenceActor,
  RealtimePresenceMap,
} from "./tableViewTypes";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewPresenceState<T extends Data>(
  scope: Pick<TableViewScope<T>, "rowRealtime">,
) {
  const { presenceByRow } = scope.rowRealtime;
  const replacePresenceMap = (next: RealtimePresenceMap) => {
    presenceByRow.value = next;
  };

  const upsertPresence = (rowId: string, actor: RealtimePresenceActor) => {
    const current = presenceByRow.value[rowId] ?? [];
    if (current.some((entry) => entry.sessionId === actor.sessionId)) return;
    replacePresenceMap({
      ...presenceByRow.value,
      [rowId]: [...current, actor],
    });
  };

  const removePresence = (rowId: string, sessionId: string) => {
    const current = presenceByRow.value[rowId];
    if (!current) return;
    const next = current.filter((entry) => entry.sessionId !== sessionId);
    if (next.length === 0) {
      const { [rowId]: _removed, ...rest } = presenceByRow.value;
      replacePresenceMap(rest);
      return;
    }
    replacePresenceMap({ ...presenceByRow.value, [rowId]: next });
  };

  const applySnapshot = (
    entries: Array<{
      rowId: string;
      actor: { id: string; displayName?: string; avatarUrl?: string };
      sessionId: string;
      since?: number;
    }>,
  ) => {
    const next: RealtimePresenceMap = {};
    for (const entry of entries) {
      const list = next[entry.rowId] ?? [];
      list.push({
        ...entry.actor,
        sessionId: entry.sessionId,
        since: entry.since,
      });
      next[entry.rowId] = list;
    }
    replacePresenceMap(next);
  };
  return { applySnapshot, upsertPresence, removePresence };
}

export function useTableViewPresenceEvents<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "rowRealtime" | "presenceState" | "configuration"
  >,
) {
  const { realtimePresenceTopic, realtimeUser, presenceByRow } =
    scope.rowRealtime;
  const { applySnapshot, upsertPresence, removePresence } = scope.presenceState;
  const { REALTIME_EVENT_TYPE } = scope.configuration;
  useRealtimeTopic(realtimePresenceTopic, (event) => {
    const eventTyped: {
      type?: string;
      payload?: {
        rowId?: string;
        actor?: { id: string; displayName?: string; avatarUrl?: string };
        sessionId?: string;
        since?: number;
      };
      entries?: Array<{
        rowId: string;
        actor: { id: string; displayName?: string; avatarUrl?: string };
        sessionId: string;
        since?: number;
      }>;
    } = event;
    if (Array.isArray(eventTyped.entries)) {
      applySnapshot(eventTyped.entries);
      return;
    }
    const { rowId, actor, sessionId, since } = eventTyped.payload ?? {};
    if (!rowId || !sessionId) return;
    if (eventTyped.type === REALTIME_EVENT_TYPE.ACQUIRED && actor) {
      upsertPresence(rowId, { ...actor, sessionId, since });
      return;
    }
    if (eventTyped.type === REALTIME_EVENT_TYPE.RELEASED) {
      removePresence(rowId, sessionId);
    }
  });

  const filterSelf = (
    entries: RealtimePresenceActor[],
  ): RealtimePresenceActor[] => {
    const myId = realtimeUser.value?._id;
    return myId ? entries.filter((entry) => entry.id !== myId) : entries;
  };

  const otherEditorsForRow = (rowId: string): RealtimePresenceActor[] => {
    return filterSelf(presenceByRow.value[rowId] ?? []);
  };

  const presenceByRowFiltered = computed<RealtimePresenceMap>(() => {
    const result: RealtimePresenceMap = {};
    for (const [rowId, entries] of Object.entries(presenceByRow.value)) {
      const others = filterSelf(entries);
      if (others.length > 0) result[rowId] = others;
    }
    return result;
  });
  return { otherEditorsForRow, presenceByRowFiltered };
}

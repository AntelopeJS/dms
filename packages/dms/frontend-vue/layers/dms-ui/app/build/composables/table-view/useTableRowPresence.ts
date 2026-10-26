import { computed, ref, type MaybeRefOrGetter } from "vue";
import { useRealtimeTopic } from "../../../../../dms-core/app/composables/realtime/useRealtimeTopic";

const PRESENCE_EVENT_TYPE = {
  ACQUIRED: "acquired",
  RELEASED: "released",
} as const;

interface RealtimePresenceActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  sessionId: string;
  since?: number;
}

type RealtimePresenceMap = Record<string, RealtimePresenceActor[]>;

interface PresenceUser {
  id: string;
  displayName?: string;
  avatarUrl?: string;
}

interface PresenceEntry {
  rowId: string;
  actor: PresenceUser;
  sessionId: string;
  since?: number;
}

interface PresenceEvent {
  type?: string;
  payload?: Partial<PresenceEntry>;
  entries?: PresenceEntry[];
}

/**
 * Who else holds a table's rows open for editing, read from its presence
 * topic: a snapshot replaces the whole map, an `acquired` or `released` event
 * adds or removes one session. The current user's own sessions are left out.
 */
export function useTableRowPresence(
  topic: MaybeRefOrGetter<string | undefined>,
) {
  const presenceByRow = ref<RealtimePresenceMap>({});
  const { user } = useDmsUserSession();

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

  const applySnapshot = (entries: PresenceEntry[]) => {
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

  useRealtimeTopic(topic, (event) => {
    const eventTyped = event as PresenceEvent;
    if (Array.isArray(eventTyped.entries)) {
      applySnapshot(eventTyped.entries);
      return;
    }
    const { rowId, actor, sessionId, since } = eventTyped.payload ?? {};
    if (!rowId || !sessionId) return;
    if (eventTyped.type === PRESENCE_EVENT_TYPE.ACQUIRED && actor) {
      upsertPresence(rowId, { ...actor, sessionId, since });
      return;
    }
    if (eventTyped.type === PRESENCE_EVENT_TYPE.RELEASED) {
      removePresence(rowId, sessionId);
    }
  });

  const filterSelf = (
    entries: RealtimePresenceActor[],
  ): RealtimePresenceActor[] => {
    const myId = user.value?._id;
    return myId ? entries.filter((entry) => entry.id !== myId) : entries;
  };

  const otherEditorsForRow = (rowId: string): RealtimePresenceActor[] =>
    filterSelf(presenceByRow.value[rowId] ?? []);

  const othersByRow = computed<RealtimePresenceMap>(() => {
    const result: RealtimePresenceMap = {};
    for (const [rowId, entries] of Object.entries(presenceByRow.value)) {
      const others = filterSelf(entries);
      if (others.length > 0) result[rowId] = others;
    }
    return result;
  });

  return { othersByRow, otherEditorsForRow };
}

import { computed, onUnmounted, ref, watch } from "vue";
import type { useForm } from "../../../composables/form/useForm";

const REALTIME_PRESENCE_FLAG = "_presence=1";
const REALTIME_ACQUIRE_PATH = "/api/realtime/acquire";
const REALTIME_RELEASE_PATH = "/api/realtime/release";
const REALTIME_PRESENCE_TOPIC_PREFIX = "tableview:presence:";
const REALTIME_ROW_TOPIC_PREFIX = "tableview:row:";
const REALTIME_GET_SEGMENT = "/get";
const REALTIME_EVENT_UPDATED = "updated";

interface RealtimeFormContext {
  location: string;
  rowId: string;
  presenceTopic: string;
  rowTopic: string;
}

interface FormRealtimeSource
  extends Pick<
    ReturnType<typeof useForm>,
    "resolvedFetchUrl" | "state" | "fetchData" | "submitSucceeded"
  > {
  markFormClean: () => void;
}

const parseRealtimeContext = (
  fetchUrl: string | undefined,
): RealtimeFormContext | null => {
  if (!fetchUrl || !fetchUrl.includes(REALTIME_PRESENCE_FLAG)) return null;
  const url = new URL(fetchUrl, "http://placeholder");
  const idx = url.pathname.lastIndexOf(REALTIME_GET_SEGMENT);
  if (idx === -1) return null;
  const location = url.pathname.slice(0, idx);
  const rowId = url.searchParams.get("id");
  if (!location || !rowId) return null;
  return {
    location,
    rowId,
    presenceTopic: `${REALTIME_PRESENCE_TOPIC_PREFIX}${location}`,
    rowTopic: `${REALTIME_ROW_TOPIC_PREFIX}${location}`,
  };
};

/** Presence acquisition, concurrent updates and close-time release for Form.vue. */
export function formComponentRealtime(source: FormRealtimeSource) {
  const realtimeContext = computed(() =>
    parseRealtimeContext(source.resolvedFetchUrl.value),
  );
  const showConcurrentEditBanner = ref(false);
  const { user: realtimeUser } = useDmsUserSession();
  const { $authFetch } = useAuthFetch({ notifyReadOnlyRefusal: false });
  const pageRealtime = useUserRealtime();
  const acquired = ref<{
    sessionId: string;
    pageId: string;
    topic: string;
    key: string;
  } | null>(null);

  watch(
    () =>
      [
        pageRealtime.sessionId.value,
        pageRealtime.pageId.value,
        realtimeContext.value,
      ] as const,
    async ([sessionId, pageId, ctx]) => {
      if (!sessionId || !pageId || !ctx) return;
      if (
        acquired.value &&
        acquired.value.sessionId === sessionId &&
        acquired.value.topic === ctx.presenceTopic &&
        acquired.value.key === ctx.rowId
      ) {
        return;
      }
      try {
        await $authFetch(REALTIME_ACQUIRE_PATH, {
          method: "POST",
          body: { pageId, topic: ctx.presenceTopic, key: ctx.rowId },
        });
        acquired.value = {
          sessionId,
          pageId,
          topic: ctx.presenceTopic,
          key: ctx.rowId,
        };
      } catch (error) {
        console.warn("[Form] acquire failed", error);
      }
    },
    { immediate: true },
  );

  useRealtimeTopic(
    () => realtimeContext.value?.rowTopic,
    (event) => {
      const ctx = realtimeContext.value;
      if (!ctx) return;
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- RealtimeTopicEvent owns an open payload, not a validated ids array; retain the original unchecked topic projection rather than rejecting malformed events.
      const eventTyped = event as {
        type: string;
        payload?: { ids?: string[] };
        actorId?: string;
      };
      if (eventTyped.type !== REALTIME_EVENT_UPDATED) return;
      if (!eventTyped.payload?.ids?.includes(ctx.rowId)) return;
      if (eventTyped.actorId === realtimeUser.value?._id) return;
      showConcurrentEditBanner.value = true;
    },
  );

  const handleDiscardAndRefresh = async () => {
    const fresh = await source.fetchData();
    if (fresh && Object.keys(fresh).length > 0) {
      Object.assign(source.state.value, fresh);
    }
    source.markFormClean();
    showConcurrentEditBanner.value = false;
  };

  const handleKeepEditing = () => {
    showConcurrentEditBanner.value = false;
  };

  onUnmounted(async () => {
    const captured = acquired.value;
    if (!captured || source.submitSucceeded.value) return;
    try {
      await $authFetch(REALTIME_RELEASE_PATH, {
        method: "POST",
        body: {
          pageId: captured.pageId,
          topic: captured.topic,
          key: captured.key,
        },
      });
    } catch (error) {
      console.warn("[Form] release on close failed", error);
    }
  });

  return {
    showConcurrentEditBanner,
    handleDiscardAndRefresh,
    handleKeepEditing,
  };
}

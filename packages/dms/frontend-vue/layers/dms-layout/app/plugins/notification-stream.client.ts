import type { RealtimeEvent } from "#dms-core/app/composables/realtime/useUserRealtime";
import { isString } from "#dms-core/app/utils/type-check";
import {
  feedCountsOf,
  isIdList,
  isUserNotification,
} from "../build/utils/notificationPayload";

const NOTIFICATION_TOPIC_PREFIX = "notifications:user:";
const NOTIFICATION_NEW_TYPE = "notification:new";
const NOTIFICATION_READ_TYPE = "notification:read";
const NOTIFICATION_ALL_READ_TYPE = "notification:all-read";
const NOTIFICATION_UNREAD_TYPE = "notification:unread";

type Handler = (payload: RealtimeEvent["payload"]) => void | Promise<void>;

export default defineDmsPlugin(() => {
  const { user, loggedIn } = useDmsUserSession();
  const {
    handleIncomingNotification,
    handleRemoteRead,
    handleRemoteUnread,
    handleRemoteAllRead,
  } = useNotifications();
  const realtime = useUserRealtime();

  const handlers = new Map<RealtimeEvent["type"], Handler>([
    [
      NOTIFICATION_NEW_TYPE,
      (payload) => {
        const notification = payload?.notification;
        if (isUserNotification(notification)) {
          handleIncomingNotification(notification);
        }
      },
    ],
    [
      NOTIFICATION_READ_TYPE,
      async (payload) => {
        const ids = payload?.ids;
        if (isIdList(ids)) {
          await handleRemoteRead(ids, feedCountsOf(payload?.counts));
        }
      },
    ],
    [
      NOTIFICATION_UNREAD_TYPE,
      async (payload) => {
        const ids = payload?.ids;
        if (isIdList(ids)) {
          await handleRemoteUnread(ids, feedCountsOf(payload?.counts));
        }
      },
    ],
    [
      NOTIFICATION_ALL_READ_TYPE,
      async (payload) => {
        await handleRemoteAllRead(feedCountsOf(payload?.counts));
      },
    ],
  ]);

  let unsubscribe: (() => void) | undefined;

  watch(
    () => (loggedIn.value ? user.value?._id : undefined),
    (userId) => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (!isString(userId) || userId === "") return;
      unsubscribe = realtime.subscribe(
        `${NOTIFICATION_TOPIC_PREFIX}${userId}`,
        async (event) => {
          if (!("type" in event)) return;
          const handler = handlers.get(event.type);
          if (!handler) return;
          await handler(event.payload);
        },
      );
    },
    { immediate: true },
  );
});

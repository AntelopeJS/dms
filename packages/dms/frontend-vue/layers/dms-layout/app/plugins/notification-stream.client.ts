import type { UserNotification } from "../composables/notification/useNotifications";

const NOTIFICATION_TOPIC_PREFIX = "notifications:user:";
const NOTIFICATION_NEW_TYPE = "notification:new";
const NOTIFICATION_READ_TYPE = "notification:read";
const NOTIFICATION_ALL_READ_TYPE = "notification:all-read";

interface IncomingPayload {
  notification?: UserNotification;
  ids?: string[];
}

const isNotificationEvent = (
  event: unknown,
): event is { type: string; payload?: IncomingPayload } =>
  !!event &&
  typeof event === "object" &&
  typeof (event as Record<string, unknown>).type === "string";

type Handler = (payload: IncomingPayload | undefined) => void | Promise<void>;

export default defineDmsPlugin(() => {
  const { user, loggedIn } = useUserSession();
  const { handleIncomingNotification, handleRemoteRead, handleRemoteAllRead } =
    useNotifications();
  const realtime = useUserRealtime();

  const handlers: Record<string, Handler> = {
    [NOTIFICATION_NEW_TYPE]: (payload) => {
      if (payload?.notification)
        handleIncomingNotification(payload.notification);
    },
    [NOTIFICATION_READ_TYPE]: async (payload) => {
      if (Array.isArray(payload?.ids)) await handleRemoteRead(payload.ids);
    },
    [NOTIFICATION_ALL_READ_TYPE]: async () => {
      await handleRemoteAllRead();
    },
  };

  let unsubscribe: (() => void) | undefined;

  watch(
    () => (loggedIn.value ? user.value?._id : undefined),
    (userId) => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (!userId) return;
      unsubscribe = realtime.subscribe(
        `${NOTIFICATION_TOPIC_PREFIX}${userId}`,
        (event) => {
          if (!isNotificationEvent(event)) return;
          const handler = handlers[event.type];
          if (!handler) return;
          void handler(event.payload);
        },
      );
    },
    { immediate: true },
  );
});

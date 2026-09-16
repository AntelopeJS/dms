import { NotificationEvents } from "./types/events";

export interface UserNotification {
  _id: string;
  userId: string;
  icon: string;
  title: string;
  description: string;
  params: Record<string, string | number> | null;
  linkTo: string | null;
  isRead: boolean;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
}

const NOTIFICATION_COMPONENT_ID = "global-notifications";
const NOTIFICATIONS_PAGE_SIZE = 20;

export const useNotifications = () => {
  const { $authFetch } = useAuthFetch();
  const { sendComponentEvent } = useComponentEvent();
  const unreadCount = useDmsState<number>("notifications-unread-count", () => 0);
  const unreadPreview = useDmsState<UserNotification[]>(
    "notifications-unread-preview",
    () => [],
  );
  const notifications = useDmsState<UserNotification[]>(
    "notifications-list",
    () => [],
  );
  const offset = useDmsState<number>("notifications-offset", () => 0);
  const hasMore = useDmsState<boolean>("notifications-has-more", () => true);

  const fetchUnreadCount = async () => {
    const data = await $authFetch<{ count: number }>(
      "/settings/user/notifications/unread-count",
    );
    if (data) {
      unreadCount.value = data.count;
    }
  };

  const fetchUnreadPreview = async () => {
    const data = await $authFetch<UserNotification[]>(
      "/settings/user/notifications/unread-preview",
    );
    if (data) {
      unreadPreview.value = data;
    }
  };

  const fetchNotifications = async (reset = false) => {
    if (reset) {
      offset.value = 0;
      notifications.value = [];
      hasMore.value = true;
    }

    const data = await $authFetch<UserNotification[]>(
      `/settings/user/notifications/list?limit=${NOTIFICATIONS_PAGE_SIZE}&offset=${offset.value}`,
    );

    if (data) {
      notifications.value = [...notifications.value, ...data];
      offset.value += data.length;
      hasMore.value = data.length === NOTIFICATIONS_PAGE_SIZE;
    }
  };

  const markAsRead = async (notificationId: string) => {
    await $authFetch(
      `/settings/user/notifications/mark-read/${notificationId}`,
      {
        method: "PUT",
      },
    );

    const updateNotification = (n: UserNotification) => {
      if (n._id === notificationId) {
        return { ...n, isRead: true };
      }
      return n;
    };

    notifications.value = notifications.value.map(updateNotification);
    unreadPreview.value = unreadPreview.value.map(updateNotification);

    await fetchUnreadCount();

    sendComponentEvent(
      NotificationEvents.NOTIFICATION_READ,
      NOTIFICATION_COMPONENT_ID,
      { notificationId },
    );
  };

  const deleteNotification = async (notificationId: string) => {
    await $authFetch(`/settings/user/notifications/delete/${notificationId}`, {
      method: "DELETE",
    });

    notifications.value = notifications.value.filter(
      (n) => n._id !== notificationId,
    );
    unreadPreview.value = unreadPreview.value.filter(
      (n) => n._id !== notificationId,
    );

    await fetchUnreadCount();

    sendComponentEvent(
      NotificationEvents.NOTIFICATION_DELETED,
      NOTIFICATION_COMPONENT_ID,
      { notificationId },
    );
  };

  const markAllAsRead = async () => {
    await $authFetch("/settings/user/notifications/mark-all-read", {
      method: "PUT",
    });

    notifications.value = notifications.value.map((n) => ({
      ...n,
      isRead: true,
    }));
    unreadPreview.value = [];

    await fetchUnreadCount();

    sendComponentEvent(
      NotificationEvents.COUNT_CHANGED,
      NOTIFICATION_COMPONENT_ID,
      { count: 0 },
    );
  };

  const deleteAll = async () => {
    await $authFetch("/settings/user/notifications/delete-all", {
      method: "DELETE",
    });

    notifications.value = [];
    unreadPreview.value = [];
    unreadCount.value = 0;
    hasMore.value = false;

    sendComponentEvent(
      NotificationEvents.COUNT_CHANGED,
      NOTIFICATION_COMPONENT_ID,
      { count: 0 },
    );
  };

  const handleRemoteRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    const idsSet = new Set(ids);
    const updateNotification = (n: UserNotification) =>
      idsSet.has(n._id) ? { ...n, isRead: true } : n;
    notifications.value = notifications.value.map(updateNotification);
    unreadPreview.value = unreadPreview.value.map(updateNotification);
    await fetchUnreadCount();
    for (const notificationId of ids) {
      sendComponentEvent(
        NotificationEvents.NOTIFICATION_READ,
        NOTIFICATION_COMPONENT_ID,
        { notificationId },
      );
    }
  };

  const handleRemoteAllRead = async () => {
    notifications.value = notifications.value.map((n) => ({
      ...n,
      isRead: true,
    }));
    unreadPreview.value = [];
    await fetchUnreadCount();
    sendComponentEvent(
      NotificationEvents.COUNT_CHANGED,
      NOTIFICATION_COMPONENT_ID,
      { count: 0 },
    );
  };

  const handleIncomingNotification = (incoming: UserNotification) => {
    const isAlreadyKnown = notifications.value.some(
      (n) => n._id === incoming._id,
    );
    if (isAlreadyKnown) return;
    notifications.value = [incoming, ...notifications.value];
    unreadPreview.value = [incoming, ...unreadPreview.value];
    unreadCount.value += 1;
    sendComponentEvent(
      NotificationEvents.NOTIFICATION_RECEIVED,
      NOTIFICATION_COMPONENT_ID,
      { notification: incoming },
    );
    sendComponentEvent(
      NotificationEvents.COUNT_CHANGED,
      NOTIFICATION_COMPONENT_ID,
      { count: unreadCount.value },
    );
  };

  return {
    unreadCount,
    unreadPreview,
    notifications,
    hasMore,
    fetchUnreadCount,
    fetchUnreadPreview,
    fetchNotifications,
    markAsRead,
    deleteNotification,
    markAllAsRead,
    deleteAll,
    handleIncomingNotification,
    handleRemoteRead,
    handleRemoteAllRead,
  };
};

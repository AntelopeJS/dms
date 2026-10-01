import { NotificationEvents } from "./types/events";

/** Icon well colour a sender may set on a notification. */
export type NotificationTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "error";

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
  subjectId?: string;
  tone?: NotificationTone | null;
  createdAt: string;
  updatedAt: string;
}

/** Tabs of the settings inbox. */
export type NotificationInboxFilter = "all" | "unread";

/** Totals behind the All and Unread inbox tabs. */
export interface NotificationCounts {
  all: number;
  unread: number;
}

interface MarkAllReadResponse {
  success: boolean;
  ids?: string[];
}

const API_BASE = "/settings/user/notifications";
const NOTIFICATION_COMPONENT_ID = "global-notifications";
const NOTIFICATIONS_PAGE_SIZE = 20;

const buildListUrl = (offset: number, filter: NotificationInboxFilter) => {
  const query = new URLSearchParams({
    limit: String(NOTIFICATIONS_PAGE_SIZE),
    offset: String(offset),
  });
  if (filter === "unread") query.set("filter", "unread");
  return `${API_BASE}/list?${query.toString()}`;
};

/**
 * Shared notification state: the header bell (unread count, popover feed)
 * and the settings inbox (its own filtered feed and tab totals) read and
 * update the same rows, so a change made in one shows in the other.
 */
export const useNotifications = () => {
  const { $authFetch } = useAuthFetch();
  const { sendComponentEvent } = useComponentEvent();
  const unreadCount = useDmsState<number>(
    "notifications-unread-count",
    () => 0,
  );
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
  const inboxFilter = useDmsState<NotificationInboxFilter>(
    "notifications-inbox-filter",
    () => "all",
  );
  const inboxItems = useDmsState<UserNotification[]>(
    "notifications-inbox-items",
    () => [],
  );
  const inboxHasMore = useDmsState<boolean>(
    "notifications-inbox-has-more",
    () => true,
  );
  const inboxCounts = useDmsState<NotificationCounts>(
    "notifications-inbox-counts",
    () => ({ all: 0, unread: 0 }),
  );

  const lists = [notifications, unreadPreview, inboxItems];

  const setReadState = (ids: string[], isRead: boolean) => {
    const idsSet = new Set(ids);
    for (const list of lists) {
      list.value = list.value.map((n) =>
        idsSet.has(n._id) ? { ...n, isRead } : n,
      );
    }
  };

  const setAllRead = () => {
    for (const list of lists) {
      list.value = list.value.map((n) => ({ ...n, isRead: true }));
    }
    unreadPreview.value = [];
  };

  const removeFromLists = (ids: string[]) => {
    const idsSet = new Set(ids);
    for (const list of lists) {
      list.value = list.value.filter((n) => !idsSet.has(n._id));
    }
  };

  const emitRead = (ids: string[]) => {
    for (const notificationId of ids) {
      sendComponentEvent(
        NotificationEvents.NOTIFICATION_READ,
        NOTIFICATION_COMPONENT_ID,
        { notificationId },
      );
    }
  };

  const emitCount = () => {
    sendComponentEvent(
      NotificationEvents.COUNT_CHANGED,
      NOTIFICATION_COMPONENT_ID,
      { count: unreadCount.value },
    );
  };

  const fetchUnreadCount = async () => {
    const data = await $authFetch<{ count: number }>(
      `${API_BASE}/unread-count`,
    );
    if (data) {
      unreadCount.value = data.count;
    }
  };

  /** Refreshes the inbox tab totals, and the bell count with them. */
  const fetchCounts = async () => {
    const data = await $authFetch<NotificationCounts>(`${API_BASE}/counts`);
    if (!data) return;
    inboxCounts.value = data;
    unreadCount.value = data.unread;
  };

  const fetchUnreadPreview = async () => {
    const data = await $authFetch<UserNotification[]>(
      `${API_BASE}/unread-preview`,
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
      buildListUrl(offset.value, "all"),
    );

    if (data) {
      notifications.value = [...notifications.value, ...data];
      offset.value += data.length;
      hasMore.value = data.length === NOTIFICATIONS_PAGE_SIZE;
    }
  };

  /** Loads the next page of the settings inbox, or its first one on `reset`. */
  const fetchInbox = async (reset = false) => {
    if (reset) {
      inboxItems.value = [];
      inboxHasMore.value = true;
    }

    const data = await $authFetch<UserNotification[]>(
      buildListUrl(inboxItems.value.length, inboxFilter.value),
    );

    if (data) {
      const known = new Set(inboxItems.value.map((n) => n._id));
      const fresh = data.filter((n) => !known.has(n._id));
      inboxItems.value = [...inboxItems.value, ...fresh];
      inboxHasMore.value = data.length === NOTIFICATIONS_PAGE_SIZE;
    }
  };

  const setInboxFilter = async (filter: NotificationInboxFilter) => {
    inboxFilter.value = filter;
    await Promise.all([fetchInbox(true), fetchCounts()]);
  };

  const markAsRead = async (notificationId: string) => {
    await $authFetch(`${API_BASE}/mark-read/${notificationId}`, {
      method: "PUT",
    });
    setReadState([notificationId], true);
    unreadPreview.value = unreadPreview.value.filter((n) => !n.isRead);
    await fetchCounts();
    emitRead([notificationId]);
  };

  const markAsUnread = async (notificationId: string) => {
    await $authFetch(`${API_BASE}/mark-unread/${notificationId}`, {
      method: "PUT",
    });
    setReadState([notificationId], false);
    await fetchCounts();
    emitCount();
  };

  const deleteNotification = async (notificationId: string) => {
    await $authFetch(`${API_BASE}/delete/${notificationId}`, {
      method: "DELETE",
    });
    removeFromLists([notificationId]);
    await fetchCounts();

    sendComponentEvent(
      NotificationEvents.NOTIFICATION_DELETED,
      NOTIFICATION_COMPONENT_ID,
      { notificationId },
    );
  };

  /** Marks everything read and returns the ids it changed, for an undo. */
  const markAllAsRead = async (): Promise<string[]> => {
    const response = await $authFetch<MarkAllReadResponse>(
      `${API_BASE}/mark-all-read`,
      { method: "PUT" },
    );
    setAllRead();
    await fetchCounts();
    emitCount();
    return response?.ids ?? [];
  };

  /** Reopens the notifications a "mark all as read" changed. */
  const undoMarkAllAsRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    await $authFetch(`${API_BASE}/mark-unread`, {
      method: "PUT",
      body: { ids },
    });
    setReadState(ids, false);
    await fetchCounts();
    emitCount();
  };

  const deleteAll = async () => {
    await $authFetch(`${API_BASE}/delete-all`, {
      method: "DELETE",
    });

    for (const list of lists) list.value = [];
    unreadCount.value = 0;
    inboxCounts.value = { all: 0, unread: 0 };
    hasMore.value = false;
    inboxHasMore.value = false;
    emitCount();
  };

  const handleRemoteRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setReadState(ids, true);
    unreadPreview.value = unreadPreview.value.filter((n) => !n.isRead);
    await fetchCounts();
    emitRead(ids);
  };

  const handleRemoteUnread = async (ids: string[]) => {
    if (ids.length === 0) return;
    setReadState(ids, false);
    await fetchCounts();
    emitCount();
  };

  const handleRemoteAllRead = async () => {
    setAllRead();
    await fetchCounts();
    emitCount();
  };

  const handleIncomingNotification = (incoming: UserNotification) => {
    const isAlreadyKnown = notifications.value.some(
      (n) => n._id === incoming._id,
    );
    if (isAlreadyKnown) return;
    notifications.value = [incoming, ...notifications.value];
    unreadPreview.value = [incoming, ...unreadPreview.value];
    inboxItems.value = [incoming, ...inboxItems.value];
    unreadCount.value += 1;
    inboxCounts.value = {
      all: inboxCounts.value.all + 1,
      unread: inboxCounts.value.unread + 1,
    };
    sendComponentEvent(
      NotificationEvents.NOTIFICATION_RECEIVED,
      NOTIFICATION_COMPONENT_ID,
      { notification: incoming },
    );
    emitCount();
  };

  return {
    unreadCount,
    unreadPreview,
    notifications,
    hasMore,
    inboxFilter,
    inboxItems,
    inboxHasMore,
    inboxCounts,
    fetchUnreadCount,
    fetchCounts,
    fetchUnreadPreview,
    fetchNotifications,
    fetchInbox,
    setInboxFilter,
    markAsRead,
    markAsUnread,
    deleteNotification,
    markAllAsRead,
    undoMarkAllAsRead,
    deleteAll,
    handleIncomingNotification,
    handleRemoteRead,
    handleRemoteUnread,
    handleRemoteAllRead,
  };
};

import { NotificationEvents } from "./types/events";

/** Icon well colour a sender may set on a notification. */
export type NotificationTone =
  | "neutral"
  | "primary"
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

/**
 * The whole feed's totals, with the tone of the unread badge (the header
 * bell, the Notifications entry): the most important unread notification's,
 * which the server weighs as the inbox draws it.
 */
interface FeedCounts {
  all: number;
  unread: number;
  unreadTone?: NotificationTone;
}

const API_BASE = "/settings/user/notifications";
const NOTIFICATION_COMPONENT_ID = "global-notifications";
const NOTIFICATIONS_PAGE_SIZE = 20;

const buildListUrl = (offset: number) =>
  `${API_BASE}/list?limit=${NOTIFICATIONS_PAGE_SIZE}&offset=${offset}`;

/**
 * Shared notification state of the header bell (unread count and tone,
 * popover feed) and of the settings navigation; the settings inbox is a
 * table view of its own (`dms:inbox`), which lists the feed again when these
 * counts change.
 *
 * The bell and the Notifications entry show the same badge: `unreadCount`,
 * the whole feed's unread total, in `unreadTone`. Opening the bell changes
 * neither; a notification leaves the count once opened or marked read.
 */
export const useNotifications = () => {
  const { $authFetch } = useAuthFetch();
  const { sendComponentEvent } = useComponentEvent();
  const unreadCount = useDmsState<number>(
    "notifications-unread-count",
    () => 0,
  );
  const unreadTone = useDmsState<NotificationTone | undefined>(
    "notifications-unread-tone",
    () => undefined,
  );
  // Whether the counts have been asked once, answered or not: until then,
  // a 0 unread is not known to be true.
  const areCountsLoaded = useDmsState<boolean>(
    "notifications-counts-loaded",
    () => false,
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

  const lists = [notifications, unreadPreview];

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

  /** Takes the whole feed's unread total and its tone. */
  const applyFeedCounts = (counts: FeedCounts) => {
    unreadCount.value = counts.unread;
    unreadTone.value = counts.unread > 0 ? counts.unreadTone : undefined;
  };

  /** Loads the whole feed's unread count and tone, the bell's badge. */
  const fetchBellCounts = async () => {
    try {
      const counts = await $authFetch<FeedCounts>(`${API_BASE}/counts`);
      if (counts) applyFeedCounts(counts);
    } finally {
      areCountsLoaded.value = true;
    }
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
      buildListUrl(offset.value),
    );

    if (data) {
      notifications.value = [...notifications.value, ...data];
      offset.value += data.length;
      hasMore.value = data.length === NOTIFICATIONS_PAGE_SIZE;
    }
  };

  const markAsRead = async (notificationId: string) => {
    await $authFetch(`${API_BASE}/mark-read/${notificationId}`, {
      method: "PUT",
    });
    setReadState([notificationId], true);
    unreadPreview.value = unreadPreview.value.filter((n) => !n.isRead);
    await fetchBellCounts();
    emitRead([notificationId]);
  };

  const markAsUnread = async (notificationId: string) => {
    await $authFetch(`${API_BASE}/mark-unread/${notificationId}`, {
      method: "PUT",
    });
    setReadState([notificationId], false);
    await fetchBellCounts();
    emitCount();
  };

  const deleteNotification = async (notificationId: string) => {
    await $authFetch(`${API_BASE}/delete/${notificationId}`, {
      method: "DELETE",
    });
    removeFromLists([notificationId]);
    await fetchBellCounts();

    sendComponentEvent(
      NotificationEvents.NOTIFICATION_DELETED,
      NOTIFICATION_COMPONENT_ID,
      { notificationId },
    );
  };

  const handleRemoteRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setReadState(ids, true);
    unreadPreview.value = unreadPreview.value.filter((n) => !n.isRead);
    await fetchBellCounts();
    emitRead(ids);
  };

  const handleRemoteUnread = async (ids: string[]) => {
    if (ids.length === 0) return;
    setReadState(ids, false);
    await fetchBellCounts();
    emitCount();
  };

  const handleRemoteAllRead = async () => {
    setAllRead();
    await fetchBellCounts();
    emitCount();
  };

  /**
   * A notification pushed in real time: listed first and counted unread at
   * once, then the counts are asked again for the tone the server weighs.
   */
  const handleIncomingNotification = async (incoming: UserNotification) => {
    const isAlreadyKnown = notifications.value.some(
      (n) => n._id === incoming._id,
    );
    if (isAlreadyKnown) return;
    notifications.value = [incoming, ...notifications.value];
    unreadPreview.value = [incoming, ...unreadPreview.value];
    if (!incoming.isRead) unreadCount.value += 1;
    sendComponentEvent(
      NotificationEvents.NOTIFICATION_RECEIVED,
      NOTIFICATION_COMPONENT_ID,
      { notification: incoming },
    );
    emitCount();
    await fetchBellCounts();
  };

  return {
    unreadCount,
    unreadTone,
    areCountsLoaded,
    unreadPreview,
    notifications,
    hasMore,
    fetchBellCounts,
    fetchUnreadPreview,
    fetchNotifications,
    markAsRead,
    markAsUnread,
    deleteNotification,
    handleIncomingNotification,
    handleRemoteRead,
    handleRemoteUnread,
    handleRemoteAllRead,
  };
};

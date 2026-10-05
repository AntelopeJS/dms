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
 * The whole feed's totals, with what the header bell counts: the unread
 * notifications that arrived since it was last opened.
 */
interface FeedCounts {
  all: number;
  unread: number;
  unseen?: number;
}

const API_BASE = "/settings/user/notifications";
const NOTIFICATION_COMPONENT_ID = "global-notifications";
const NOTIFICATIONS_PAGE_SIZE = 20;

const buildListUrl = (offset: number) =>
  `${API_BASE}/list?limit=${NOTIFICATIONS_PAGE_SIZE}&offset=${offset}`;

/**
 * Shared notification state of the header bell (unseen count, popover feed)
 * and of the settings navigation (unread count); the settings inbox is a
 * table view of its own (`dms:inbox`), which lists the feed again when these
 * counts change.
 *
 * Seen and read are two states. The bell's badge (`unseenCount`) counts the
 * unread notifications that arrived since the bell last opened, and opening
 * it resets the badge (`markAllSeen`). A notification becomes read only when
 * it is opened or marked read; `unreadCount` (the whole feed's unread total)
 * feeds the Notifications entry of the settings navigation and its overview
 * card.
 */
export const useNotifications = () => {
  const { $authFetch } = useAuthFetch();
  const { sendComponentEvent } = useComponentEvent();
  const unreadCount = useDmsState<number>(
    "notifications-unread-count",
    () => 0,
  );
  const unseenCount = useDmsState<number>(
    "notifications-unseen-count",
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

  /** Takes the whole feed's unread and unseen totals. */
  const applyFeedCounts = (counts: FeedCounts) => {
    unreadCount.value = counts.unread;
    if (typeof counts.unseen === "number") unseenCount.value = counts.unseen;
  };

  /** Loads the bell's unseen count and the whole feed's unread count. */
  const fetchBellCounts = async () => {
    const counts = await $authFetch<FeedCounts>(`${API_BASE}/counts`);
    if (counts) applyFeedCounts(counts);
  };

  /**
   * The bell was opened: its badge resets, and counts again what arrives
   * later. The notifications stay unread.
   */
  const markAllSeen = async () => {
    unseenCount.value = 0;
    await $authFetch(`${API_BASE}/seen`, { method: "PUT" });
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

  /** The bell was opened in another tab: this one's badge resets too. */
  const handleRemoteSeen = () => {
    unseenCount.value = 0;
  };

  /**
   * A notification pushed in real time: the bell counts it as new (unseen)
   * and unread, and lists it first.
   */
  const handleIncomingNotification = (incoming: UserNotification) => {
    const isAlreadyKnown = notifications.value.some(
      (n) => n._id === incoming._id,
    );
    if (isAlreadyKnown) return;
    notifications.value = [incoming, ...notifications.value];
    unreadPreview.value = [incoming, ...unreadPreview.value];
    if (!incoming.isRead) {
      unreadCount.value += 1;
      unseenCount.value += 1;
    }
    sendComponentEvent(
      NotificationEvents.NOTIFICATION_RECEIVED,
      NOTIFICATION_COMPONENT_ID,
      { notification: incoming },
    );
    emitCount();
  };

  return {
    unreadCount,
    unseenCount,
    unreadPreview,
    notifications,
    hasMore,
    fetchBellCounts,
    fetchUnreadPreview,
    fetchNotifications,
    markAsRead,
    markAsUnread,
    markAllSeen,
    deleteNotification,
    handleIncomingNotification,
    handleRemoteRead,
    handleRemoteUnread,
    handleRemoteAllRead,
    handleRemoteSeen,
  };
};

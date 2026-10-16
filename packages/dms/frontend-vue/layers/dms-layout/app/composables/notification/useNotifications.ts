import { pageRoutePath } from "#dms-core/app/utils/pageRoutes";
import { onBeforeMount } from "vue";
import { NotificationEvents } from "./types/events";
import { unreadToneWith } from "../../build/components/pages/settings/notification/notificationDisplay";

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
export interface FeedCounts {
  all: number;
  unread: number;
  unreadTone?: NotificationTone;
}

/**
 * What a write on the feed answers (marking read or unread, deleting), and
 * what its realtime event carries: the whole feed's counts after it.
 */
interface FeedWriteResult {
  counts?: FeedCounts;
}

const API_BASE = pageRoutePath("/settings/user/notifications");
const BELL_COUNTS_DATA_KEY = "dms-notification-bell-counts";
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

  /** Reads the whole feed's unread count and tone, the bell's badge. */
  const readBellCounts = (signal?: AbortSignal) =>
    $authFetch<FeedCounts>(`${API_BASE}/counts`, { signal });

  /** Takes counts as the bell's: from now on, they are known. */
  const applyBellCounts = (counts: FeedCounts | undefined) => {
    if (counts) applyFeedCounts(counts);
    areCountsLoaded.value = true;
  };

  /** Loads the whole feed's unread count and tone, the bell's badge. */
  const fetchBellCounts = async () => {
    try {
      applyBellCounts(await readBellCounts());
    } finally {
      areCountsLoaded.value = true;
    }
  };

  /**
   * Takes the counts a write answered or its realtime event carried. A
   * write's own event brings the same counts again, which changes nothing;
   * without counts (a server before they were sent) they are read.
   */
  const takeWriteCounts = async (counts: FeedCounts | undefined) => {
    if (counts) applyBellCounts(counts);
    else await fetchBellCounts();
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
    const { counts } = await $authFetch<FeedWriteResult>(
      `${API_BASE}/mark-read/${notificationId}`,
      { method: "PUT" },
    );
    setReadState([notificationId], true);
    unreadPreview.value = unreadPreview.value.filter((n) => !n.isRead);
    await takeWriteCounts(counts);
    emitRead([notificationId]);
  };

  const markAsUnread = async (notificationId: string) => {
    const { counts } = await $authFetch<FeedWriteResult>(
      `${API_BASE}/mark-unread/${notificationId}`,
      { method: "PUT" },
    );
    setReadState([notificationId], false);
    await takeWriteCounts(counts);
    emitCount();
  };

  const deleteNotification = async (notificationId: string) => {
    const { counts } = await $authFetch<FeedWriteResult>(
      `${API_BASE}/delete/${notificationId}`,
      { method: "DELETE" },
    );
    removeFromLists([notificationId]);
    await takeWriteCounts(counts);

    sendComponentEvent(
      NotificationEvents.NOTIFICATION_DELETED,
      NOTIFICATION_COMPONENT_ID,
      { notificationId },
    );
  };

  // The realtime events of the user's feed, this tab's own writes included:
  // each carries the feed's counts after it.
  const handleRemoteRead = async (ids: string[], counts?: FeedCounts) => {
    if (ids.length === 0) return;
    setReadState(ids, true);
    unreadPreview.value = unreadPreview.value.filter((n) => !n.isRead);
    await takeWriteCounts(counts);
    emitRead(ids);
  };

  const handleRemoteUnread = async (ids: string[], counts?: FeedCounts) => {
    if (ids.length === 0) return;
    setReadState(ids, false);
    await takeWriteCounts(counts);
    emitCount();
  };

  const handleRemoteAllRead = async (counts?: FeedCounts) => {
    setAllRead();
    await takeWriteCounts(counts);
    emitCount();
  };

  /**
   * A notification pushed in real time: listed first, counted unread, and its
   * tone weighed into the badge's here, without asking the server again — a
   * broadcast would otherwise have every open tab fetch the counts at once.
   */
  const handleIncomingNotification = (incoming: UserNotification) => {
    const isAlreadyKnown = notifications.value.some(
      (n) => n._id === incoming._id,
    );
    if (isAlreadyKnown) return;
    notifications.value = [incoming, ...notifications.value];
    unreadPreview.value = [incoming, ...unreadPreview.value];
    if (!incoming.isRead) unreadCount.value += 1;
    unreadTone.value = unreadToneWith(unreadTone.value, incoming);
    sendComponentEvent(
      NotificationEvents.NOTIFICATION_RECEIVED,
      NOTIFICATION_COMPONENT_ID,
      { notification: incoming },
    );
    emitCount();
  };

  return {
    unreadCount,
    unreadTone,
    areCountsLoaded,
    unreadPreview,
    notifications,
    hasMore,
    fetchBellCounts,
    readBellCounts,
    applyBellCounts,
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

/**
 * The header bell's counts (the unread total and its tone) for the chrome
 * drawing the bell, called in its setup: read with the page for a signed-in
 * user, so a server render shows the badge, and the bell's state starts from
 * the same counts in the browser before anything renders them. The browser
 * neither asks again nor sees them move as it hydrates (which the inbox would
 * take for a new notification and list again). The bell then keeps them
 * current (realtime, its own refreshes).
 */
export function useRenderedBellCounts(): void {
  const notifications = useNotifications();
  if (
    !useDmsUserSession().loggedIn.value ||
    notifications.areCountsLoaded.value
  )
    return;
  const read = useApiData<FeedCounts>(
    BELL_COUNTS_DATA_KEY,
    async ({ signal }) => {
      const counts = await notifications.readBellCounts(signal);
      notifications.applyBellCounts(counts);
      return counts;
    },
  );
  // A client navigation into the dashboard mounts the bell before this read
  // answers: the bell waits for it instead of reading the counts again.
  if (!import.meta.env.SSR)
    renderedBellCountsRead = Promise.resolve(read).then(
      () => undefined,
      () => undefined,
    );
  onBeforeMount(() => {
    if (read.data.value) notifications.applyBellCounts(read.data.value);
  });
}

/** The browser's last `useRenderedBellCounts` read, settled or not. */
let renderedBellCountsRead: Promise<void> | undefined;

/** Waits for the counts `useRenderedBellCounts` reads, if it reads any. */
export function settledRenderedBellCounts(): Promise<void> | undefined {
  return renderedBellCountsRead;
}

import { NotificationEvents } from "./types/events";
import {
  type InboxApiFilter,
  type InboxReadState,
  inboxApiParams,
  isNarrowedInbox,
  matchesInboxFilter,
} from "./inboxFilters";

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

/** Read-state tabs of the settings inbox. */
export type NotificationInboxFilter = InboxReadState;

/** Totals behind the All and Unread inbox tabs. */
export interface NotificationCounts {
  all: number;
  unread: number;
}

/**
 * The whole feed's totals, with what the header bell counts: the unread
 * notifications that arrived since it was last opened.
 */
interface FeedCounts extends NotificationCounts {
  unseen?: number;
}

/** A category / subject pair the user has notifications in. */
export interface NotificationFacetSubject {
  categoryId: string;
  subjectId: string;
}

/** What the user's feed holds, for the inbox search and filters. */
export interface NotificationFacets {
  /** Stored message keys (without `$`), matched against their translation. */
  messageKeys: string[];
  subjects: NotificationFacetSubject[];
}

interface MarkAllReadResponse {
  success: boolean;
  ids?: string[];
}

const API_BASE = "/settings/user/notifications";
const NOTIFICATION_COMPONENT_ID = "global-notifications";
const NOTIFICATIONS_PAGE_SIZE = 20;
const KEY_PREFIX = "$";

/** The whole feed: what the header bell lists, and the inbox without filters. */
export const UNFILTERED_INBOX: Readonly<InboxApiFilter> = Object.freeze({
  q: "",
  keys: [],
  category: "",
  subject: "",
  status: "all",
});

const withQuery = (path: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

const buildListUrl = (offset: number, filter: InboxApiFilter) => {
  const query = inboxApiParams(filter, true);
  query.set("limit", String(NOTIFICATIONS_PAGE_SIZE));
  query.set("offset", String(offset));
  return `${API_BASE}/list?${query.toString()}`;
};

/** The bulk actions' params: none acts on the whole feed. */
const bulkParams = (filter?: InboxApiFilter) =>
  filter ? inboxApiParams(filter, true) : new URLSearchParams();

const storedKeysOf = (notification: UserNotification) =>
  [notification.title, notification.description]
    .filter((value) => value?.startsWith(KEY_PREFIX))
    .map((value) => value.slice(KEY_PREFIX.length));

/**
 * Shared notification state: the header bell (unseen count, popover feed)
 * and the settings inbox (its own filtered feed and tab totals) read and
 * update the same rows, so a change made in one shows in the other.
 *
 * Seen and read are two states. The bell's badge (`unseenCount`) counts the
 * unread notifications that arrived since the bell last opened, and opening
 * it resets the badge (`markAllSeen`). A notification becomes read only when
 * it is opened or marked read; `unreadCount` (the whole feed's unread total)
 * feeds the Notifications entry of the settings navigation and its overview
 * card. Both always count the whole feed; the inbox totals follow its search
 * and category.
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
  const inboxFilter = useDmsState<InboxApiFilter>(
    "notifications-inbox-api-filter",
    () => ({ ...UNFILTERED_INBOX }),
  );
  // Bumped by every inbox reset: a page answered for an older filter is dropped.
  const inboxGeneration = useDmsState<number>(
    "notifications-inbox-generation",
    () => 0,
  );
  const inboxFacets = useDmsState<NotificationFacets>(
    "notifications-inbox-facets",
    () => ({ messageKeys: [], subjects: [] }),
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
   * Refreshes the inbox tab totals (for its search and category) and the
   * whole feed's unread and unseen counts, which one request serves while
   * the inbox is not narrowed.
   */
  const fetchCounts = async () => {
    const filter = inboxFilter.value;
    const isNarrowed = isNarrowedInbox(filter);
    const [counts, feed] = await Promise.all([
      $authFetch<FeedCounts>(
        withQuery(`${API_BASE}/counts`, inboxApiParams(filter, false)),
      ),
      isNarrowed ? $authFetch<FeedCounts>(`${API_BASE}/counts`) : undefined,
    ]);
    if (feed) applyFeedCounts(feed);
    if (!counts) return;
    if (!isNarrowed) applyFeedCounts(counts);
    // A filter changed meanwhile asks for its own totals.
    if (filter === inboxFilter.value) {
      inboxCounts.value = { all: counts.all, unread: counts.unread };
    }
  };

  /**
   * The bell was opened: its badge resets, and counts again what arrives
   * later. The notifications stay unread.
   */
  const markAllSeen = async () => {
    unseenCount.value = 0;
    await $authFetch(`${API_BASE}/seen`, { method: "PUT" });
  };

  /** Loads the message keys and subjects the inbox search and filters offer. */
  const fetchInboxFacets = async () => {
    const data = await $authFetch<NotificationFacets>(`${API_BASE}/facets`);
    if (data) inboxFacets.value = data;
  };

  /** Adds what a new notification brings to the facets. */
  const noteFacets = (incoming: UserNotification) => {
    const { messageKeys, subjects } = inboxFacets.value;
    const newKeys = storedKeysOf(incoming).filter(
      (key) => !messageKeys.includes(key),
    );
    const isNewSubject =
      !!incoming.subjectId &&
      !subjects.some(
        (subject) =>
          subject.categoryId === incoming.categoryId &&
          subject.subjectId === incoming.subjectId,
      );
    if (newKeys.length === 0 && !isNewSubject) return;
    inboxFacets.value = {
      messageKeys: [...messageKeys, ...newKeys],
      subjects: isNewSubject
        ? [
            ...subjects,
            {
              categoryId: incoming.categoryId,
              subjectId: incoming.subjectId ?? "",
            },
          ]
        : subjects,
    };
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
      buildListUrl(offset.value, UNFILTERED_INBOX),
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
      inboxGeneration.value += 1;
      inboxItems.value = [];
      inboxHasMore.value = true;
    }
    const generation = inboxGeneration.value;

    const data = await $authFetch<UserNotification[]>(
      buildListUrl(inboxItems.value.length, inboxFilter.value),
    );

    if (data && generation === inboxGeneration.value) {
      const known = new Set(inboxItems.value.map((n) => n._id));
      const fresh = data.filter((n) => !known.has(n._id));
      inboxItems.value = [...inboxItems.value, ...fresh];
      inboxHasMore.value = data.length === NOTIFICATIONS_PAGE_SIZE;
    }
  };

  /** Applies a search, category and read state, and reloads the inbox. */
  const setInboxFilter = async (filter: InboxApiFilter) => {
    inboxFilter.value = { ...filter, keys: [...filter.keys] };
    await Promise.all([fetchInbox(true), fetchCounts()]);
  };

  /** Drops the inbox filter (the inbox left the page), without reloading. */
  const resetInboxFilter = () => {
    inboxFilter.value = { ...UNFILTERED_INBOX };
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

  /**
   * Marks everything read, or only what `filter` keeps, and returns the ids
   * it changed, for an undo.
   */
  const markAllAsRead = async (filter?: InboxApiFilter): Promise<string[]> => {
    const params = bulkParams(filter);
    const response = await $authFetch<MarkAllReadResponse>(
      withQuery(`${API_BASE}/mark-all-read`, params),
      { method: "PUT" },
    );
    const ids = response?.ids ?? [];
    if (params.toString() !== "") {
      setReadState(ids, true);
      unreadPreview.value = unreadPreview.value.filter((n) => !n.isRead);
    } else {
      setAllRead();
    }
    await fetchCounts();
    emitCount();
    return ids;
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

  /** Deletes everything, or only what `filter` keeps. */
  const deleteAll = async (filter?: InboxApiFilter) => {
    const params = bulkParams(filter);
    await $authFetch(withQuery(`${API_BASE}/delete-all`, params), {
      method: "DELETE",
    });

    if (filter && params.toString() !== "") {
      // The rows it removed are the ones the filter matches, the way the
      // server matched them.
      for (const list of lists) {
        list.value = list.value.filter(
          (n) => !matchesInboxFilter(n, filter, true),
        );
      }
      await Promise.all([fetchInbox(true), fetchCounts()]);
      emitCount();
      return;
    }

    for (const list of lists) list.value = [];
    unreadCount.value = 0;
    unseenCount.value = 0;
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

  /** The bell was opened in another tab: this one's badge resets too. */
  const handleRemoteSeen = () => {
    unseenCount.value = 0;
  };

  /**
   * A notification pushed in real time. The bell always counts it as new
   * (unseen) and unread; the inbox counts it when it matches the search and
   * category, and lists it when it matches the read state too.
   */
  const handleIncomingNotification = (incoming: UserNotification) => {
    const isAlreadyKnown = [notifications, inboxItems].some((list) =>
      list.value.some((n) => n._id === incoming._id),
    );
    if (isAlreadyKnown) return;
    notifications.value = [incoming, ...notifications.value];
    unreadPreview.value = [incoming, ...unreadPreview.value];
    if (!incoming.isRead) {
      unreadCount.value += 1;
      unseenCount.value += 1;
    }
    const filter = inboxFilter.value;
    if (matchesInboxFilter(incoming, filter, false)) {
      inboxCounts.value = {
        all: inboxCounts.value.all + 1,
        unread: inboxCounts.value.unread + (incoming.isRead ? 0 : 1),
      };
      if (matchesInboxFilter(incoming, filter, true)) {
        inboxItems.value = [incoming, ...inboxItems.value];
      }
    }
    noteFacets(incoming);
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
    inboxFilter,
    inboxItems,
    inboxHasMore,
    inboxCounts,
    inboxFacets,
    fetchBellCounts,
    fetchCounts,
    fetchUnreadPreview,
    fetchNotifications,
    fetchInbox,
    fetchInboxFacets,
    setInboxFilter,
    resetInboxFilter,
    markAsRead,
    markAsUnread,
    markAllSeen,
    deleteNotification,
    markAllAsRead,
    undoMarkAllAsRead,
    deleteAll,
    handleIncomingNotification,
    handleRemoteRead,
    handleRemoteUnread,
    handleRemoteAllRead,
    handleRemoteSeen,
  };
};

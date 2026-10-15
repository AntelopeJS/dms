// @vitest-environment jsdom
/**
 * The bell's counts after a change of the feed: a write (mark read or
 * unread, delete) answers them and its realtime event carries them, so the
 * tab that wrote and every other tab of the user take them as they are. The
 * write's own event, which comes before or after its answer, changes
 * nothing and reads nothing. Through the real composable, its stream plugin
 * and the runtime's state, over a fake feed.
 */
import { defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountInBrowser, stubApiData } from "./helpers/api-data-runtime";

type Tone = "neutral" | "primary" | "warning" | "error";
interface Row {
  _id: string;
  isRead: boolean;
  tone: Tone;
}
interface Counts {
  all: number;
  unread: number;
  unreadTone?: Tone;
}
type StreamEvent = { type: string; payload?: Record<string, unknown> };

const TONE_ORDER: Tone[] = ["error", "warning", "primary", "neutral"];
const feed: Row[] = [];

/** The whole feed's counts, as `countFeedWithUnreadTone` gives them. */
function countsOf(): Counts {
  const unread = feed.filter((row) => !row.isRead);
  const tone = TONE_ORDER.find((t) => unread.some((row) => row.tone === t));
  return tone
    ? { all: feed.length, unread: unread.length, unreadTone: tone }
    : { all: feed.length, unread: unread.length };
}

const requests: string[] = [];
// A write's answer can be held, to deliver its echo first.
let holdWrites: Promise<void> | undefined;
let failWrites = false;
const authFetch = vi.fn(
  async (url: string, options?: { method?: string }) => {
    const method = options?.method ?? "GET";
    requests.push(`${method} ${url}`);
    if (method === "GET" && url.endsWith("/counts")) return countsOf();
    if (failWrites) throw new Error("refused");
    const id = url.split("/").pop();
    const row = feed.find((entry) => entry._id === id);
    if (url.includes("/mark-read/")) row!.isRead = true;
    else if (url.includes("/mark-unread/")) row!.isRead = false;
    else if (url.includes("/delete/")) feed.splice(feed.indexOf(row!), 1);
    const counts = countsOf();
    await holdWrites;
    return { success: true, counts };
  },
);

let streamHandler: ((event: unknown) => void) | undefined;
stubApiData(authFetch as never);
vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: vi.fn() }));
vi.stubGlobal("useUserSession", () => ({
  user: ref({ _id: "u1" }),
  loggedIn: ref(true),
}));
vi.stubGlobal("useUserRealtime", () => ({
  subscribe: (_topic: string, handler: (event: unknown) => void) => {
    streamHandler = handler;
    return () => {
      streamHandler = undefined;
    };
  },
}));
vi.stubGlobal("defineDmsPlugin", (setup: () => void) => setup);
vi.stubGlobal("watch", (await import("vue")).watch);
const { useNotifications } = await import(
  "../layers/dms-layout/app/composables/notification/useNotifications"
);
vi.stubGlobal("useNotifications", useNotifications);
const { default: notificationStream } = await import(
  "../layers/dms-layout/app/plugins/notification-stream.client"
);

const mounted: App[] = [];
let bell: ReturnType<typeof useNotifications>;

/** A tab: the bell's state and the stream plugin, on one runtime. */
function openTab(): HTMLElement {
  const Tab = defineComponent({
    setup() {
      bell = useNotifications();
      (notificationStream as unknown as () => void)();
      return () =>
        h("span", `${bell.unreadCount.value}:${bell.unreadTone.value ?? "-"}`);
    },
  });
  const { app, container } = mountInBrowser(Tab);
  mounted.push(app);
  return container;
}

/** The server's event for a read state change, with the counts after it. */
const echo = (type: string, ids: string[]): StreamEvent => ({
  type,
  payload: { ids, counts: countsOf() },
});

async function settle(): Promise<void> {
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
}

beforeEach(async () => {
  feed.splice(
    0,
    feed.length,
    { _id: "risk", isRead: false, tone: "error" },
    { _id: "check", isRead: false, tone: "warning" },
    { _id: "old", isRead: true, tone: "neutral" },
  );
  requests.length = 0;
  holdWrites = undefined;
  failWrites = false;
  const tab = openTab();
  await bell.fetchBellCounts();
  await settle();
  expect(tab.textContent).toBe("2:error");
  requests.length = 0;
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

it("takes the counts a write answers, and reads nothing for its echo after the answer", async () => {
  await bell.markAsRead("risk");
  await settle();
  expect(bell.unreadCount.value).toBe(1);
  // The next most important unread one gives the tone: only the server knows it.
  expect(bell.unreadTone.value).toBe("warning");

  streamHandler!(echo("notification:read", ["risk"]));
  await settle();
  expect(requests).toEqual(["PUT /dms/pages/settings/user/notifications/mark-read/risk"]);
  expect(bell.unreadCount.value).toBe(1);

  await bell.markAsUnread("risk");
  await bell.deleteNotification("check");
  await settle();
  expect(requests).toEqual([
    "PUT /dms/pages/settings/user/notifications/mark-read/risk",
    "PUT /dms/pages/settings/user/notifications/mark-unread/risk",
    "DELETE /dms/pages/settings/user/notifications/delete/check",
  ]);
  expect([bell.unreadCount.value, bell.unreadTone.value]).toEqual([
    1,
    "error",
  ]);
});

it("reads nothing when the write's echo comes before its answer", async () => {
  let release!: () => void;
  holdWrites = new Promise((done) => {
    release = done;
  });
  const writing = bell.markAsRead("check");
  await settle();
  streamHandler!(echo("notification:read", ["check"]));
  await settle();
  expect([bell.unreadCount.value, bell.unreadTone.value]).toEqual([
    1,
    "error",
  ]);
  release();
  await writing;
  await settle();
  expect(requests).toEqual([
    "PUT /dms/pages/settings/user/notifications/mark-read/check",
  ]);
  expect(bell.unreadCount.value).toBe(1);
});

it("takes another tab's changes from their events, without reading", async () => {
  feed[0]!.isRead = true;
  streamHandler!(echo("notification:read", ["risk"]));
  await settle();
  expect([bell.unreadCount.value, bell.unreadTone.value]).toEqual([
    1,
    "warning",
  ]);

  feed[0]!.isRead = false;
  streamHandler!(echo("notification:unread", ["risk"]));
  await settle();
  expect(bell.unreadTone.value).toBe("error");

  for (const row of feed) row.isRead = true;
  streamHandler!({
    type: "notification:all-read",
    payload: { counts: countsOf() },
  });
  await settle();
  expect([bell.unreadCount.value, bell.unreadTone.value]).toEqual([
    0,
    undefined,
  ]);
  expect(requests).toEqual([]);
});

it("reads the counts when an event carries none", async () => {
  feed[0]!.isRead = true;
  streamHandler!({ type: "notification:read", payload: { ids: ["risk"] } });
  await settle();
  expect(requests).toEqual(["GET /dms/pages/settings/user/notifications/counts"]);
  expect(bell.unreadCount.value).toBe(1);
});

it("keeps the counts when a write fails", async () => {
  failWrites = true;
  await expect(bell.markAsRead("risk")).rejects.toThrow("refused");
  await settle();
  expect(requests).toEqual(["PUT /dms/pages/settings/user/notifications/mark-read/risk"]);
  expect([bell.unreadCount.value, bell.unreadTone.value]).toEqual([
    2,
    "error",
  ]);
});

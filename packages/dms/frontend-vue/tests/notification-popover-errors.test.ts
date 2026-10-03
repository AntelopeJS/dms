// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type App,
} from "vue";
import NotificationPopover from "../layers/dms-layout/app/build/components/notification/NotificationPopover.vue";

const HTTP_FORBIDDEN = 403;
const UNREAD_COUNT = 4;
const UNSEEN_COUNT = 2;

interface NotificationsStub {
  unreadCount: ReturnType<typeof ref<number>>;
  unseenCount: ReturnType<typeof ref<number>>;
  notifications: ReturnType<typeof ref<unknown[]>>;
  fetchBellCounts: ReturnType<typeof vi.fn>;
  fetchNotifications: ReturnType<typeof vi.fn>;
  markAsRead: ReturnType<typeof vi.fn>;
  markAllSeen: ReturnType<typeof vi.fn>;
  markAllAsRead: ReturnType<typeof vi.fn>;
}

const UNREAD_NOTIFICATION = {
  _id: "n1",
  userId: "u1",
  icon: "i-ph-bell",
  title: "Hello",
  description: "World",
  params: null,
  linkTo: null,
  isRead: false,
  categoryId: "system",
  subjectId: "general",
  createdAt: "2026-10-02T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
};

let app: App;
let host: HTMLDivElement;
let errorHandler: ReturnType<typeof vi.fn>;
let notifications: NotificationsStub;

function forbidden(): Promise<never> {
  return Promise.reject(
    Object.assign(new Error("tenant.suspended"), {
      response: { status: HTTP_FORBIDDEN },
    }),
  );
}

const Popover = defineComponent({
  props: { open: { type: Boolean, default: false } },
  emits: ["update:open"],
  setup:
    (props, { emit, slots }) =>
    () =>
      h("div", [
        h(
          "div",
          { "data-trigger": "", onClick: () => emit("update:open", true) },
          slots.default?.(),
        ),
        h("button", {
          "data-close": "",
          onClick: () => emit("update:open", false),
        }),
        props.open ? slots.content?.() : null,
      ]),
});

const Card = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", { "data-card": "" }, slots.default?.()),
});

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

function installRuntime(): void {
  Object.entries({
    ref,
    computed,
    watch,
    nextTick,
    onMounted,
    onUnmounted,
  }).forEach(([key, value]) => vi.stubGlobal(key, value));
  vi.stubGlobal("useDmsState", <T>(_key: string, init: () => T) => ref(init()));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key, locale: "en" }));
  vi.stubGlobal("useUserSession", () => ({ loggedIn: ref(true) }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useNotifications", () => ({
    ...notifications,
    hasMore: ref(false),
  }));
  vi.stubGlobal("useInfiniteScroll", () => ({
    isLoadingMore: ref(false),
    setupObserver: vi.fn(),
    disconnectObserver: vi.fn(),
  }));
  vi.stubGlobal("NotificationEvents", { NOTIFICATION_RECEIVED: "received" });
  vi.stubGlobal("FormEvents", { SUBMIT_SUCCESS: "submit-success" });
  vi.stubGlobal("navigateDms", vi.fn());
}

async function mountPopover(): Promise<void> {
  app = createApp(NotificationPopover);
  app.config.errorHandler = errorHandler;
  app.config.globalProperties.$t = (key: string) => key;
  app.component("UPopover", Popover);
  app.component("UButton", Passthrough);
  app.component("USeparator", Passthrough);
  app.component("UIcon", Passthrough);
  app.component("UCard", Card);
  app.mount(host);
  await vi.waitFor(() =>
    expect(notifications.fetchBellCounts).toHaveBeenCalled(),
  );
  await nextTick();
}

async function openPopover(): Promise<void> {
  host.querySelector<HTMLElement>("[data-trigger]")!.click();
  await vi.waitFor(() =>
    expect(notifications.fetchNotifications).toHaveBeenCalled(),
  );
  await nextTick();
}

async function closePopover(): Promise<void> {
  host.querySelector<HTMLElement>("[data-close]")!.click();
  await nextTick();
  await nextTick();
}

function badgeText(): string {
  return host.querySelector("[data-trigger] span")?.textContent?.trim() ?? "";
}

beforeEach(() => {
  errorHandler = vi.fn();
  notifications = {
    unreadCount: ref(0),
    unseenCount: ref(0),
    notifications: ref([]),
    fetchBellCounts: vi.fn(),
    fetchNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllSeen: vi.fn(async () => {
      notifications.unseenCount.value = 0;
    }),
    markAllAsRead: vi.fn(),
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  installRuntime();
  host = document.createElement("div");
});

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("badges the unseen notifications, not every unread one", async () => {
  notifications.fetchBellCounts.mockImplementation(async () => {
    notifications.unreadCount.value = UNREAD_COUNT;
    notifications.unseenCount.value = UNSEEN_COUNT;
  });
  await mountPopover();
  expect(badgeText()).toBe(String(UNSEEN_COUNT));
});

it("hides the badge instead of failing the page when the count is refused", async () => {
  notifications.unreadCount.value = UNREAD_COUNT;
  notifications.unseenCount.value = UNSEEN_COUNT;
  notifications.fetchBellCounts.mockImplementation(forbidden);
  await mountPopover();
  await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
  expect(errorHandler).not.toHaveBeenCalled();
  expect(notifications.unreadCount.value).toBe(0);
  expect(notifications.unseenCount.value).toBe(0);
  expect(badgeText()).toBe("");
});

it("marks the notifications seen on open, and never read on close", async () => {
  const sendBeacon = vi.fn();
  vi.stubGlobal("navigator", { sendBeacon });
  notifications.unreadCount.value = UNREAD_COUNT;
  notifications.unseenCount.value = UNSEEN_COUNT;
  notifications.notifications.value = [UNREAD_NOTIFICATION];
  await mountPopover();

  await openPopover();
  await vi.waitFor(() => expect(notifications.markAllSeen).toHaveBeenCalled());
  expect(badgeText()).toBe("");
  expect(host.querySelector(".bg-primary")).not.toBeNull();

  await closePopover();
  window.dispatchEvent(new Event("beforeunload"));
  expect(notifications.markAllAsRead).not.toHaveBeenCalled();
  expect(notifications.markAsRead).not.toHaveBeenCalled();
  expect(sendBeacon).not.toHaveBeenCalled();
  expect(notifications.unreadCount.value).toBe(UNREAD_COUNT);
});

it("does not mark seen again when nothing new arrived", async () => {
  await mountPopover();
  await openPopover();
  await closePopover();
  expect(notifications.markAllSeen).not.toHaveBeenCalled();
});

it("marks seen on close what arrived while the list was open", async () => {
  await mountPopover();
  await openPopover();
  notifications.unseenCount.value = 1;
  await closePopover();
  await vi.waitFor(() =>
    expect(notifications.markAllSeen).toHaveBeenCalledTimes(1),
  );
});

it("marks a notification read when it is clicked", async () => {
  notifications.notifications.value = [UNREAD_NOTIFICATION];
  await mountPopover();
  await openPopover();
  host.querySelector<HTMLElement>("[data-card]")!.click();
  await vi.waitFor(() =>
    expect(notifications.markAsRead).toHaveBeenCalledWith("n1"),
  );
});

it("does not mark an already read notification again", async () => {
  notifications.notifications.value = [
    { ...UNREAD_NOTIFICATION, isRead: true },
  ];
  await mountPopover();
  await openPopover();
  host.querySelector<HTMLElement>("[data-card]")!.click();
  await nextTick();
  expect(notifications.markAsRead).not.toHaveBeenCalled();
});

it("keeps the page alive when the notification list is refused on open", async () => {
  notifications.fetchNotifications.mockImplementation(forbidden);
  await mountPopover();
  await openPopover();
  await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
  expect(errorHandler).not.toHaveBeenCalled();
  expect(host.textContent).toContain("notification.dropdown.no_notifications");
});

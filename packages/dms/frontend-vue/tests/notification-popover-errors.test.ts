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
  type Ref,
} from "vue";
import NotificationPopover from "../layers/dms-layout/app/build/components/notification/NotificationPopover.vue";

const HTTP_FORBIDDEN = 403;
const UNREAD_COUNT = 4;
const NOTIFICATIONS_PAGE = "settings.user.notifications";

interface NotificationsStub {
  unreadCount: Ref<number>;
  unreadTone: Ref<string | undefined>;
  notifications: Ref<unknown[]>;
  fetchBellCounts: ReturnType<typeof vi.fn>;
  fetchNotifications: ReturnType<typeof vi.fn>;
  markAsRead: ReturnType<typeof vi.fn>;
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
let state: Map<string, Ref<unknown>>;

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
  vi.stubGlobal("useDmsState", (key: string, init: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(init()));
    return state.get(key);
  });
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

function badge(): HTMLElement | null {
  return host.querySelector("[data-bell-badge]");
}

function badgeText(): string {
  return badge()?.textContent?.trim() ?? "";
}

/** The badge the bell keeps on the Notifications entry of the navigation. */
function menuBadge(): unknown {
  const badges = state.get("dms-nav-badges")?.value as
    | Record<string, unknown>
    | undefined;
  return badges?.[NOTIFICATIONS_PAGE];
}

beforeEach(() => {
  errorHandler = vi.fn();
  state = new Map();
  notifications = {
    unreadCount: ref(0),
    unreadTone: ref(undefined),
    notifications: ref([]),
    fetchBellCounts: vi.fn(),
    fetchNotifications: vi.fn(),
    markAsRead: vi.fn(),
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

it("badges every unread notification, in the tone of the most important", async () => {
  notifications.fetchBellCounts.mockImplementation(async () => {
    notifications.unreadCount.value = UNREAD_COUNT;
    notifications.unreadTone.value = "error";
  });
  await mountPopover();
  expect(badgeText()).toBe(String(UNREAD_COUNT));
  expect(badge()!.className).toContain("bg-(--ui-color-error-500) text-white");
});

it("shows the same count and tone as the Notifications entry", async () => {
  notifications.fetchBellCounts.mockImplementation(async () => {
    notifications.unreadCount.value = UNREAD_COUNT;
    notifications.unreadTone.value = "warning";
  });
  await mountPopover();
  expect(menuBadge()).toEqual({ label: String(UNREAD_COUNT), tone: "warning" });
  expect(badge()!.className).toContain("bg-(--ui-color-warning-400)");

  // A new unread error turns both red.
  notifications.unreadCount.value = UNREAD_COUNT + 1;
  notifications.unreadTone.value = "error";
  await nextTick();
  expect(badgeText()).toBe(String(UNREAD_COUNT + 1));
  expect(badge()!.className).toContain("bg-(--ui-color-error-500)");
  expect(menuBadge()).toEqual({
    label: String(UNREAD_COUNT + 1),
    tone: "error",
  });
});

it("draws an untoned count in the accent, and hides the badge at zero", async () => {
  notifications.fetchBellCounts.mockImplementation(async () => {
    notifications.unreadCount.value = 1;
    notifications.unreadTone.value = "primary";
  });
  await mountPopover();
  expect(badge()!.className).toContain("bg-(--dms-accent-fill)");

  notifications.unreadCount.value = 0;
  notifications.unreadTone.value = undefined;
  await nextTick();
  expect(badge()).toBeNull();
  expect(menuBadge()).toEqual({ label: "" });
});

it("hides the badge instead of failing the page when the count is refused", async () => {
  notifications.unreadCount.value = UNREAD_COUNT;
  notifications.unreadTone.value = "error";
  notifications.fetchBellCounts.mockImplementation(forbidden);
  await mountPopover();
  await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
  expect(errorHandler).not.toHaveBeenCalled();
  expect(notifications.unreadCount.value).toBe(0);
  expect(notifications.unreadTone.value).toBeUndefined();
  expect(badgeText()).toBe("");
});

it("keeps the count when opened and closed: opening marks nothing", async () => {
  const sendBeacon = vi.fn();
  vi.stubGlobal("navigator", { sendBeacon });
  notifications.unreadCount.value = UNREAD_COUNT;
  notifications.unreadTone.value = "warning";
  notifications.notifications.value = [UNREAD_NOTIFICATION];
  await mountPopover();

  await openPopover();
  expect(badgeText()).toBe(String(UNREAD_COUNT));
  expect(host.querySelector(".bg-primary")).not.toBeNull();

  await closePopover();
  window.dispatchEvent(new Event("beforeunload"));
  expect(notifications.markAsRead).not.toHaveBeenCalled();
  expect(sendBeacon).not.toHaveBeenCalled();
  expect(notifications.unreadCount.value).toBe(UNREAD_COUNT);
  expect(badgeText()).toBe(String(UNREAD_COUNT));
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

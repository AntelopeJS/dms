// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
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

interface NotificationsStub {
  unreadCount: ReturnType<typeof ref<number>>;
  fetchUnreadCount: ReturnType<typeof vi.fn>;
  fetchNotifications: ReturnType<typeof vi.fn>;
}

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
        props.open ? slots.content?.() : null,
      ]),
});

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

function installRuntime(): void {
  Object.entries({ ref, watch, nextTick, onMounted, onUnmounted }).forEach(
    ([key, value]) => vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key, locale: "en" }));
  vi.stubGlobal("useUserSession", () => ({ loggedIn: ref(true) }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useNotifications", () => ({
    ...notifications,
    notifications: ref([]),
    hasMore: ref(false),
    markAllAsRead: vi.fn(),
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
  app.mount(host);
  await vi.waitFor(() =>
    expect(notifications.fetchUnreadCount).toHaveBeenCalled(),
  );
  await nextTick();
}

beforeEach(() => {
  errorHandler = vi.fn();
  notifications = {
    unreadCount: ref(0),
    fetchUnreadCount: vi.fn(),
    fetchNotifications: vi.fn(),
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

it("shows the unread badge when the count loads", async () => {
  notifications.fetchUnreadCount.mockImplementation(async () => {
    notifications.unreadCount.value = UNREAD_COUNT;
  });
  await mountPopover();
  expect(host.textContent).toContain(String(UNREAD_COUNT));
});

it("hides the badge instead of failing the page when the count is refused", async () => {
  notifications.unreadCount.value = UNREAD_COUNT;
  notifications.fetchUnreadCount.mockImplementation(forbidden);
  await mountPopover();
  await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
  expect(errorHandler).not.toHaveBeenCalled();
  expect(notifications.unreadCount.value).toBe(0);
  expect(host.textContent).not.toContain(String(UNREAD_COUNT));
});

it("keeps the page alive when the notification list is refused on open", async () => {
  notifications.fetchNotifications.mockImplementation(forbidden);
  await mountPopover();
  host.querySelector<HTMLElement>("[data-trigger]")!.click();
  await vi.waitFor(() =>
    expect(notifications.fetchNotifications).toHaveBeenCalled(),
  );
  await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
  expect(errorHandler).not.toHaveBeenCalled();
  expect(host.textContent).toContain("notification.dropdown.no_notifications");
});

// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  onMounted,
  ref,
  watch,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationInboxDisplay from "../layers/dms-layout/app/build/components/pages/settings/notification/NotificationInboxDisplay.vue";

const notifications = vi.hoisted(() => ({
  markAsRead: vi.fn(async () => {}),
  markAsUnread: vi.fn(async () => {}),
  deleteNotification: vi.fn(async () => {}),
}));

vi.mock(
  "../layers/dms-layout/app/composables/notification/useNotifications",
  async () => {
    const vue = await import("vue");
    return {
      useNotifications: () => ({
        ...notifications,
        unreadCount: vue.ref(0),
        notifications: vue.ref([]),
      }),
    };
  },
);

vi.mock(
  "../layers/dms-layout/app/build/composables/notification/useNotificationCatalog",
  async () => {
    const vue = await import("vue");
    return {
      useNotificationCatalog: () => ({
        isLoaded: vue.ref(true),
        loadCatalog: vi.fn(),
        findCategory: () => undefined,
        findSubject: () => undefined,
      }),
    };
  },
);

vi.mock(
  "../layers/dms-layout/app/build/components/pages/settings/notification/NotificationInboxItem.vue",
  async () => {
    const vue = await import("vue");
    return {
      default: vue.defineComponent({
        props: { notification: Object },
        emits: ["open", "toggle-read", "delete"],
        setup:
          (props, { emit }) =>
          () =>
            vue.h("article", { "data-id": props.notification?._id }, [
              vue.h("button", {
                class: "toggle",
                onClick: () => emit("toggle-read"),
              }),
              vue.h("button", {
                class: "remove",
                onClick: () => emit("delete"),
              }),
            ]),
      }),
    };
  },
);

vi.mock("#dms-ui/app/build/components/table/Empty.vue", async () => {
  const vue = await import("vue");
  return {
    default: vue.defineComponent({ render: () => vue.h("p", "empty") }),
  };
});

vi.mock("#dms-ui/app/build/components/table/Pagination.vue", async () => {
  const vue = await import("vue");
  return { default: vue.defineComponent({ render: () => vue.h("nav") }) };
});

let app: App | undefined;

function mount(component: Component, props: Record<string, unknown>) {
  app = createApp(defineComponent({ setup: () => () => h(component, props) }));
  for (const [name, stub] of Object.entries({
    UButton: defineComponent({
      props: { label: String },
      emits: ["click"],
      setup:
        (props, { emit }) =>
        () =>
          h("button", { onClick: () => emit("click") }, props.label),
    }),
    DmsEyebrow: defineComponent({
      props: { label: String },
      setup: (props) => () => h("h3", props.label),
    }),
    USkeleton: defineComponent({ render: () => h("span") }),
  })) {
    app.component(name, stub);
  }
  const container = document.createElement("div");
  app.mount(container);
  return container;
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("navigateDms", vi.fn());
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("notifications inbox display", () => {
  const now = new Date().toISOString();
  const contextOf = (refresh: () => Promise<void>) => ({
    items: [
      { _id: "n1", title: "Deploy", isRead: false, createdAt: now },
      { _id: "n2", title: "Invoice", isRead: true, createdAt: now },
    ],
    loading: false,
    refresh,
  });

  it("lists the feed under day headings and lists it again after a change", async () => {
    const refresh = vi.fn(async () => {});
    const container = mount(NotificationInboxDisplay as Component, {
      context: contextOf(refresh),
    });
    expect(container.querySelector("h3")?.textContent).toBe(
      "page.settings.notifications.day_today",
    );
    const rows = container.querySelectorAll("article");
    expect([...rows].map((row) => row.getAttribute("data-id"))).toEqual([
      "n1",
      "n2",
    ]);

    rows[0]!.querySelector<HTMLButtonElement>(".toggle")!.click();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(notifications.markAsRead).toHaveBeenCalledWith("n1");

    rows[1]!.querySelector<HTMLButtonElement>(".toggle")!.click();
    rows[1]!.querySelector<HTMLButtonElement>(".remove")!.click();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
    expect(notifications.markAsUnread).toHaveBeenCalledWith("n2");
    expect(notifications.deleteNotification).toHaveBeenCalledWith("n2");
  });
});

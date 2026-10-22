// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  watch,
  type App,
  type Component,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationInboxDisplay from "../layers/dms-layout/app/build/components/pages/settings/notification/NotificationInboxDisplay.vue";

const notifications = vi.hoisted(() => ({
  markAsRead: vi.fn(async () => {}),
  markAsUnread: vi.fn(async () => {}),
  deleteNotification: vi.fn(async () => {}),
}));

const confirmDialog = vi.hoisted(() => ({
  confirm: vi.fn(async (_options: Record<string, unknown>) => true),
}));

vi.mock("#dms-ui/app/composables/confirm", () => ({
  useConfirm: () => confirmDialog,
}));

// The bell's state the display watches, shared like `useDmsState`.
const bell = vi.hoisted(() => ({
  unreadCount: undefined as unknown as Ref<number>,
  notifications: undefined as unknown as Ref<{ _id: string }[]>,
}));

vi.mock(
  "../layers/dms-layout/app/composables/notification/useNotifications",
  async () => {
    const vue = await import("vue");
    bell.unreadCount = vue.ref(0);
    bell.notifications = vue.ref([]);
    return {
      useNotifications: () => ({ ...notifications, ...bell }),
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
  bell.unreadCount.value = 0;
  bell.notifications.value = [];
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

  it("asks before deleting a notification, and keeps it when the dialog is cancelled", async () => {
    const refresh = vi.fn(async () => {});
    const container = mount(NotificationInboxDisplay as Component, {
      context: contextOf(refresh),
    });
    const remove = () =>
      container.querySelector<HTMLButtonElement>("article .remove")!.click();

    confirmDialog.confirm.mockResolvedValueOnce(false);
    remove();
    await vi.waitFor(() =>
      expect(confirmDialog.confirm).toHaveBeenCalledTimes(1),
    );
    await new Promise((done) => setTimeout(done, 0));
    expect(notifications.deleteNotification).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(confirmDialog.confirm.mock.calls[0]![0]).toMatchObject({
      title: "page.settings.notifications.delete_one_title",
      color: "error",
      initialFocus: "cancel",
    });

    remove();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(notifications.deleteNotification).toHaveBeenCalledWith("n1");
  });

  it("lists the feed again once per change made here, though the change moves the counts", async () => {
    const refresh = vi.fn(async () => {});
    const container = mount(NotificationInboxDisplay as Component, {
      context: contextOf(refresh),
    });
    // As the bell does: the write's echo, then its answer, move the count and
    // rebuild the bell's lists.
    notifications.markAsRead.mockImplementationOnce(async () => {
      bell.unreadCount.value = 4;
      bell.notifications.value = [{ _id: "n1" }];
      await new Promise((done) => setTimeout(done, 0));
      bell.unreadCount.value = 3;
      bell.notifications.value = [{ _id: "n1" }];
    });
    container.querySelector<HTMLButtonElement>("article .toggle")!.click();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await new Promise((done) => setTimeout(done, 10));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lists the feed again once per change the stream brings, not when the bell rebuilds its lists", async () => {
    const refresh = vi.fn(async () => {});
    mount(NotificationInboxDisplay as Component, {
      context: contextOf(refresh),
    });
    bell.notifications.value = [{ _id: "n1" }, { _id: "n2" }];
    await nextTick();
    refresh.mockClear();

    // A read state changing elsewhere rebuilds the lists, then the count moves.
    bell.notifications.value = [{ _id: "n1" }, { _id: "n2" }];
    await nextTick();
    expect(refresh).not.toHaveBeenCalled();
    bell.unreadCount.value += 1;
    await nextTick();
    expect(refresh).toHaveBeenCalledTimes(1);

    // A notification arriving: listed first and counted, together.
    bell.notifications.value = [{ _id: "n0" }, ...bell.notifications.value];
    bell.unreadCount.value += 1;
    await nextTick();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

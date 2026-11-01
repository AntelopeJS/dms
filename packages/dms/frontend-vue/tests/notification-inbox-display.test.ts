/** @vitest-environment jsdom */
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NotificationInboxDisplay from "../layers/dms-layout/app/entries/components/pages/settings/notification/NotificationInboxDisplay";
import { useNotifications } from "../layers/dms-layout/app/composables/notification/useNotifications";
import { useComponentEvent } from "../layers/dms-core/app/composables/components/useComponentEvent";
import { browserRuntime, stubApiData } from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";
import { requestRefusal } from "./helpers/api-error-runtime";

const BASE = "/dms/pages/settings/user/notifications";
const authFetch = vi.fn(async (url: string) =>
  url.endsWith("/categories")
    ? { categories: [], subjects: [] }
    : { counts: { all: 2, unread: 1 } },
);
const confirmOpen = vi.fn(async () => true);
const createOverlay = vi.fn(() => ({ open: confirmOpen }));
const addToast = vi.fn(() => ({ id: "failure" }));
let app: App;

beforeEach(() => {
  installAuthSettingsRuntime();
  stubApiData(authFetch);
  vi.stubGlobal("useComponentEvent", useComponentEvent);
  vi.stubGlobal("useDmsAppConfig", () => ({ ui: {} }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  vi.stubGlobal("useOverlay", () => ({ create: createOverlay }));
});

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mount() {
  const refresh = vi.fn(async () => {});
  const now = new Date().toISOString();
  app = createApp(NotificationInboxDisplay, {
    context: {
      items: [
        { _id: "n1", title: "Deploy", isRead: false, createdAt: now },
        { _id: "n2", title: "Invoice", isRead: true, createdAt: now },
      ],
      loading: false,
      refresh,
    },
  });
  browserRuntime(app);
  app.component(
    "UButton",
    defineComponent({
      props: { label: String },
      setup: (props) => () => h("button", props.label),
    }),
  );
  app.component(
    "DmsEyebrow",
    defineComponent({
      props: { label: String },
      setup: (props) => () => h("h3", props.label),
    }),
  );
  app.component(
    "DmsListRow",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h("article", [
            slots.default?.(),
            slots.description?.(),
            slots.meta?.(),
            slots.trailing?.(),
          ]),
    }),
  );
  app.component("USkeleton", () => null);
  app.component("USelect", () => null);
  app.component("UIcon", () => null);
  const container = document.createElement("div");
  app.mount(container);
  const feed = app.runWithContext(useNotifications);
  const action = (row: number, label: string) => {
    const article = container.querySelectorAll("article")[row]!;
    article
      .querySelector<HTMLButtonElement>(
        `button[aria-label="page.settings.notifications.${label}"]`,
      )!
      .click();
  };
  return { container, refresh, feed, action };
}

it("lists the feed under day headings and lists it again after a change", async () => {
  const { container, action, refresh } = mount();
  expect(container.querySelector("h3")?.textContent).toBe(
    "page.settings.notifications.day_today",
  );
  expect(
    [...container.querySelectorAll("article")].map(
      (row) => row.querySelector("button")?.textContent,
    ),
  ).toEqual(["Deploy", "Invoice"]);
  action(0, "mark_read");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(authFetch).toHaveBeenCalledWith(`${BASE}/mark-read/n1`, {
    method: "PUT",
  });
  action(1, "mark_unread");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  action(1, "delete_one");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
  expect(authFetch).toHaveBeenCalledWith(`${BASE}/mark-unread/n2`, {
    method: "PUT",
  });
  expect(authFetch).toHaveBeenCalledWith(`${BASE}/delete/n2`, {
    method: "DELETE",
  });
});

it("asks before deleting a notification, and keeps it when the dialog is cancelled", async () => {
  const { action, refresh } = mount();
  confirmOpen.mockResolvedValueOnce(false);
  action(0, "delete_one");
  await vi.waitFor(() => expect(confirmOpen).toHaveBeenCalledOnce());
  expect(createOverlay.mock.calls[0]?.[1]).toMatchObject({
    props: {
      title: "page.settings.notifications.delete_one_title",
      color: "error",
      initialFocus: "cancel",
    },
  });
  expect(authFetch.mock.calls.some(([url]) => url.includes("/delete/"))).toBe(
    false,
  );
  expect(refresh).not.toHaveBeenCalled();
  action(0, "delete_one");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(authFetch).toHaveBeenCalledWith(`${BASE}/delete/n1`, {
    method: "DELETE",
  });
});

it("lists the feed again once per change made here, though the change moves the counts", async () => {
  const { action, refresh, feed } = mount();
  authFetch.mockImplementationOnce(async () => {
    await feed.handleRemoteRead(["n1"], { all: 2, unread: 4 });
    await new Promise((resolve) => setTimeout(resolve));
    return { counts: { all: 2, unread: 3 } };
  });
  action(0, "mark_read");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(refresh).toHaveBeenCalledOnce();
});

it("lists the feed again once per change the stream brings, not when the bell rebuilds its lists", async () => {
  const { feed, refresh } = mount();
  await feed.handleRemoteRead(["n1"], { all: 2, unread: 1 });
  await nextTick();
  refresh.mockClear();
  await feed.handleRemoteRead(["n1"], { all: 2, unread: 1 });
  await nextTick();
  expect(refresh).not.toHaveBeenCalled();
  await feed.handleRemoteUnread(["n1"], { all: 2, unread: 2 });
  await nextTick();
  expect(refresh).toHaveBeenCalledOnce();
  await feed.handleRemoteUnread(["n2"], { all: 2, unread: 3 });
  await nextTick();
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("refreshes a refused mark-read without a second local failure toast", async () => {
  const { action, refresh, container } = mount();
  authFetch.mockRejectedValueOnce(requestRefusal());
  action(0, "mark_read");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(addToast).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      title: "error.read_only_demo",
      color: "warning",
    }),
  );
  expect(container.textContent).toContain("Deploy");
  expect(
    container.querySelector(
      'button[aria-label="page.settings.notifications.mark_read"]',
    ),
  ).not.toBeNull();
});

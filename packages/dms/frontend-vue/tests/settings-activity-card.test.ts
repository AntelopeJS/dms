// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  type App,
} from "vue";
import type { AccountActivityRow } from "../layers/dms-layout/app/composables/settings/activity/buildAccountActivity";

const activity = {
  rows: ref<AccountActivityRow[]>([]),
  viewAll: ref<{ to: string; pageId: string } | undefined>(undefined),
  isLoading: ref(false),
};

vi.mock(
  "../layers/dms-layout/app/composables/settings/activity/useAccountActivity",
  () => ({ useAccountActivity: () => activity }),
);
vi.mock("../layers/dms-core/app/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({
    session: ref(null),
    isActive: ref(false),
    entryState: () => null,
  }),
}));

let app: App;
let host: HTMLDivElement;

const Card = defineComponent({
  props: { title: String },
  setup:
    (props, { slots }) =>
    () =>
      h("section", [
        h("header", [props.title, slots.actions?.()]),
        slots.default?.(),
      ]),
});

const EmptyState = defineComponent({
  props: { title: String, description: String },
  setup: (props) => () =>
    h("div", { "data-empty": "" }, [props.title, " ", props.description]),
});

const Item = defineComponent({
  props: { title: String, subtitle: String, trailing: String, to: String },
  setup: (props) => () =>
    h("a", { "data-item": "", href: props.to }, [
      props.title,
      "|",
      props.subtitle,
      "|",
      props.trailing,
    ]),
});

const Link = defineComponent({
  props: { to: String },
  setup:
    (props, { slots }) =>
    () =>
      h("a", { "data-view-all": "", href: props.to }, slots.default?.()),
});

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function mountCard(): Promise<void> {
  const { default: SettingsActivityCard } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/shell/SettingsActivityCard.vue"
  );
  app = createApp(SettingsActivityCard);
  app.component("DmsCard", Card);
  app.component("DmsEmptyState", EmptyState);
  app.component("DmsPermissionVeil", Passthrough);
  app.component("DmsActivityItem", Item);
  app.component("DmsLink", Link);
  app.component("UIcon", Passthrough);
  app.component("USkeleton", Passthrough);
  app.mount(host);
  await nextTick();
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  activity.rows.value = [];
  activity.viewAll.value = undefined;
  activity.isLoading.value = false;
  host = document.createElement("div");
});

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("shows the empty state when the account has no recent activity", async () => {
  await mountCard();
  const empty = host.querySelector("[data-empty]");
  expect(empty?.textContent).toContain(
    "page.settings.overview.activity.empty_title",
  );
  expect(host.querySelector("[data-item]")).toBeNull();
  expect(host.querySelector("[data-view-all]")).toBeNull();
});

it("shows three skeleton rows, not the empty state, while loading", async () => {
  activity.isLoading.value = true;
  await mountCard();
  expect(host.querySelector("[data-empty]")).toBeNull();
  const skeleton = host.querySelector("[aria-busy='true']");
  expect(skeleton?.children).toHaveLength(3);
});

it("scrolls the list inside the card without letting it size the card row", async () => {
  activity.rows.value = Array.from({ length: 6 }, (_, index) => ({
    id: String(index),
    type: "signed_in",
    icon: "i-ph-desktop",
    tone: "neutral",
    title: { key: "page.settings.overview.activity.event.signed_in" },
    meta: [],
    date: new Date().toISOString(),
  }));
  await mountCard();
  const body = host.querySelector<HTMLElement>("[data-activity-body]");
  const scroller = host.querySelector<HTMLElement>("[data-activity-scroll]");
  // Side by side, the body fills the stretched card and the scroller is out
  // of the flow, so only "Your account" sets the row height.
  expect(body?.classList).toContain("relative");
  expect(body?.classList).toContain("min-h-0");
  expect(body?.classList).toContain("lg:h-full");
  expect(scroller?.parentElement).toBe(body);
  expect(scroller?.classList).toContain("overflow-y-auto");
  expect(scroller?.classList).toContain("lg:absolute");
  expect(scroller?.classList).toContain("lg:inset-0");
  // Stacked, the list is capped to three rows of the feed row height.
  expect(scroller?.classList).toContain(
    "max-lg:max-h-[calc(3*var(--dms-activity-row-h)+0.5rem)]",
  );
  expect(body?.style.getPropertyValue("--dms-activity-row-h")).toMatch(
    /^calc\(/,
  );
  expect(scroller?.querySelectorAll("[data-item]")).toHaveLength(6);
});

it("lists the rows with their link and the View all link", async () => {
  activity.viewAll.value = {
    to: "/settings/user/notifications",
    pageId: "settings.user.notifications",
  };
  activity.rows.value = [
    {
      id: "a",
      type: "password_changed",
      icon: "i-ph-password",
      tone: "neutral",
      title: { key: "page.settings.overview.activity.event.password_changed" },
      meta: [{ literal: "203.0.113.7" }],
      date: new Date().toISOString(),
      to: "/settings/user/security#password",
      pageId: "settings.user.security",
    },
  ];
  await mountCard();
  const item = host.querySelector("[data-item]");
  expect(item?.textContent).toContain(
    "page.settings.overview.activity.event.password_changed|203.0.113.7|",
  );
  expect(item?.getAttribute("href")).toBe("/settings/user/security#password");
  expect(host.querySelector("[data-view-all]")?.getAttribute("href")).toBe(
    "/settings/user/notifications",
  );
});

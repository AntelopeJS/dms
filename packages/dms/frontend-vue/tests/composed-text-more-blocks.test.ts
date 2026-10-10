// @vitest-environment jsdom
/**
 * ActivityFeed, Meter, TopListCard and NavCardGrid draw a composed text
 * wherever they draw a text — from their options or from the JSON their
 * route answers — in the reader's language, and keep drawing plain and `$`
 * strings as before.
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  reactive,
  ref,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { resolveI18nKey } from "../layers/dms-core/app/composables/translation/useTranslation";
import { setRegionalPreferencesSource } from "../layers/dms-core/app/utils/regional";

const NOW = Date.UTC(2026, 9, 10, 12);
const THREE_MINUTES_AGO = new Date(NOW - 3 * 60 * 1000).toISOString();

const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      mail: {
        to_review:
          "no message to review | {count} message to review | {count} messages to review",
        bounced: "{count} bounced on {list}",
        device: "{browser} on {os}",
        signed_in: "Signed in on {device}",
        sent: "Sent {when}",
      },
      media: {
        files: "{count} file | {count} files",
        used: "{size} used",
        quota: "{used} of {total}",
        library: "Library",
        new: "New",
      },
      api: { last_call: "Last call {at}" },
    },
    fr: {
      mail: {
        to_review:
          "aucun message à traiter | {count} message à traiter | {count} messages à traiter",
        bounced: "{count} rejetés sur {list}",
        device: "{browser} sous {os}",
        signed_in: "Connexion sur {device}",
        sent: "Envoyé {when}",
      },
      media: {
        files: "{count} fichier | {count} fichiers",
        used: "{size} utilisés",
        quota: "{used} sur {total}",
        library: "Médiathèque",
        new: "Nouveau",
      },
      api: { last_call: "Dernier appel {at}" },
    },
  },
});

const meterData = ref<Record<string, unknown> | null>(null);

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async () => ({ items: [] }),
}));
vi.stubGlobal("useDmsRoute", () => reactive({ query: {} }));

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: () => ({}) }),
);
vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: meterData,
    isLoading: ref(false),
    error: ref(null),
    refresh: async () => {},
  }),
}));
vi.mock(
  "#dms-layout/app/build/composables/navigation/useCategoryNavCards",
  () => ({
    useCategoryNavCards: () => ({ cards: computed(() => []) }),
    usePreviewEntryVeil: () => ({
      state: () => null,
      label: () => "",
      detail: () => undefined,
      isActive: ref(false),
    }),
  }),
);

// The generic components only lay out what the block resolved: their props
// are what is checked here.
const { propsProbe } = vi.hoisted(() => ({
  propsProbe: (name: string, keys: string[]) => async () => {
    const vue = await import("vue");
    return {
      default: vue.defineComponent({
        props: keys,
        setup:
          (props, { slots }) =>
          () =>
            vue.h("div", [
              vue.h("pre", { "data-probe": name }, JSON.stringify(props)),
              slots.default?.(),
            ]),
      }),
    };
  },
}));
vi.mock(
  "../layers/dms-ui/app/components/activity/ActivityItem.vue",
  propsProbe("activity-item", ["title", "subtitle", "trailing"]),
);
vi.mock(
  "../layers/dms-ui/app/components/meter/Meter.vue",
  propsProbe("meter", ["label", "hint", "valueLabel", "segments"]),
);
vi.mock(
  "../layers/dms-ui/app/components/card/NavCard.vue",
  propsProbe("nav-card", ["title", "description", "state", "tag", "readout"]),
);
vi.mock(
  "../layers/dms-ui/app/build/components/permission/PermissionVeil.vue",
  propsProbe("veil", []),
);

const ActivityFeed = (
  await import("../layers/dms-ui/app/components/activity-feed/ActivityFeed.vue")
).default;
const MeterBlock = (
  await import("../layers/dms-ui/app/components/meter/MeterBlock.vue")
).default;
const TopListRow = (
  await import(
    "../layers/dms-ui/app/components/top-list/internal/TopListRow.vue"
  )
).default;
const NavCardGridBlock = (
  await import("../layers/dms-ui/app/components/blocks/NavCardGridBlock.vue")
).default;

const mounted: Array<{ unmount: () => void }> = [];
const plainSpaces = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

function mount(component: Component, props: Record<string, unknown>) {
  const root = document.createElement("div");
  const app = createApp(component, props);
  app.component(
    "DmsCard",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h("div", slots.default?.()),
    }),
  );
  app.mount(root);
  mounted.push(app);
  return root;
}

function probes(root: HTMLElement, name: string): Record<string, unknown>[] {
  return [...root.querySelectorAll(`[data-probe="${name}"]`)].map((probe) =>
    JSON.parse(plainSpaces(probe.textContent ?? "{}")),
  );
}

const count = (value: number) => ({ type: "count", value });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  i18n.global.locale.value = "en";
  meterData.value = null;
  setRegionalPreferencesSource(() => ({ timeZone: "UTC" }));
  vi.stubGlobal("useI18n", () => ({
    t: i18n.global.t,
    locale: i18n.global.locale,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string, params?: Record<string, unknown> | null) =>
      resolveI18nKey(i18n.global.t, key, params),
  }));
  vi.stubGlobal("useDmsCookie", () => ref<string[]>([]));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  setRegionalPreferencesSource(() => ({}));
  vi.useRealTimers();
});

describe("ActivityFeed", () => {
  const items = [
    {
      id: "review",
      title: { key: "mail.to_review", params: { count: count(3) } },
      meta: [
        {
          key: "mail.sent",
          params: { when: { type: "relative", value: THREE_MINUTES_AGO } },
        },
        "Inbox",
      ],
      time: { key: "media.new" },
    },
    {
      id: "bounced",
      title: "$mail.bounced",
      params: { count: count(1284), list: "Newsletter" },
    },
    {
      id: "legacy",
      title: "$mail.signed_in",
      meta: ["$mail.device"],
      params: { device: "$mail.device", browser: "Chrome", os: "Windows" },
    },
  ];

  it("composes titles, details and the trailing text of its entries", () => {
    const root = mount(ActivityFeed, { items, groupByDay: false, card: false });

    expect(probes(root, "activity-item")).toEqual([
      {
        title: "3 messages to review",
        subtitle: "Sent 3 minutes ago · Inbox",
        trailing: "New",
      },
      { title: "1,284 bounced on Newsletter" },
      {
        title: "Signed in on Chrome on Windows",
        subtitle: "Chrome on Windows",
      },
    ]);
  });

  it("picks the plural form of a `$` title from its count value, in French", () => {
    i18n.global.locale.value = "fr";
    const root = mount(ActivityFeed, {
      items: [
        { title: "$mail.to_review", params: { count: count(1) } },
        {
          title: "$mail.signed_in",
          params: { device: "$mail.device", browser: "Firefox", os: "Linux" },
        },
      ],
      groupByDay: false,
      card: false,
    });

    expect(probes(root, "activity-item").map((item) => item.title)).toEqual([
      "1 message à traiter",
      "Connexion sur Firefox sous Linux",
    ]);
  });
});

describe("MeterBlock", () => {
  it("composes the hint, the value text and the segment legends", () => {
    i18n.global.locale.value = "fr";
    const root = mount(MeterBlock, {
      label: "$media.library",
      hint: { key: "media.files", params: { count: count(2) } },
      valueLabel: {
        key: "media.quota",
        params: {
          used: { type: "number", value: 0.42, format: "percent" },
          total: "10 Go",
        },
      },
      segments: [
        {
          value: 3,
          label: { key: "media.files", params: { count: count(1) } },
        },
        { value: 2, label: "Plain" },
      ],
    });

    expect(probes(root, "meter")).toEqual([
      {
        label: "Médiathèque",
        hint: "2 fichiers",
        valueLabel: "42 % sur 10 Go",
        segments: [
          { value: 3, label: "1 fichier" },
          { value: 2, label: "Plain" },
        ],
      },
    ]);
  });

  it("composes the texts its route answers", () => {
    meterData.value = {
      value: 4,
      max: 10,
      hint: { key: "media.used", params: { size: "4 GB" } },
    };
    const root = mount(MeterBlock, { fetchUrl: "/api/storage" });

    expect(probes(root, "meter")[0]?.hint).toBe("4 GB used");
  });
});

describe("TopListRow", () => {
  it("composes the title and the description of a row", () => {
    i18n.global.locale.value = "fr";
    const root = mount(TopListRow, {
      item: {
        id: "orders",
        title: "$media.library",
        description: {
          key: "api.last_call",
          params: { at: { type: "relative", value: THREE_MINUTES_AGO } },
        },
        value: 12,
      },
      showRank: false,
      rankLabel: "1",
      rankClass: "",
      hasAnyIcon: false,
      showSparkline: false,
      sparklineAccent: "primary",
      showDelta: false,
      formattedValue: "12",
    });

    expect(plainSpaces(root.textContent ?? "")).toContain("Médiathèque");
    expect(plainSpaces(root.textContent ?? "")).toContain(
      "Dernier appel il y a 3 minutes",
    );
  });

  it("keeps a plain title as written", () => {
    const root = mount(TopListRow, {
      item: { id: 1, title: "GET /orders", value: 1 },
      showRank: false,
      rankLabel: "1",
      rankClass: "",
      hasAnyIcon: false,
      showSparkline: false,
      sparklineAccent: "primary",
      showDelta: false,
      formattedValue: "1",
    });

    expect(root.textContent).toContain("GET /orders");
  });
});

describe("NavCardGridBlock", () => {
  it("composes the title, description, tag, state and readout of a card", () => {
    const root = mount(NavCardGridBlock, {
      items: [
        {
          icon: "i-ph-images",
          to: "/media",
          title: { key: "media.library" },
          description: "$media.new",
          tag: { key: "media.new" },
          state: { key: "media.files", params: { count: count(1284) } },
          readout: [{ key: "media.used", params: { size: "4 GB" } }, "plain"],
        },
      ],
    });

    expect(probes(root, "nav-card")).toEqual([
      {
        title: "Library",
        description: "New",
        tag: "New",
        state: "1,284 files",
        readout: ["4 GB used", "plain"],
      },
    ]);
  });
});

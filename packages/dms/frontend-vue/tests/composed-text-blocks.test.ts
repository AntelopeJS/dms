// @vitest-environment jsdom
/**
 * StatGroup, KeyValueList and Banner draw a composed text wherever they draw
 * a text — from their options or from the JSON their route answers — in the
 * reader's language, and keep drawing plain strings as before.
 */
import {
  createApp,
  defineComponent,
  h,
  reactive,
  ref,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { setRegionalPreferencesSource } from "../layers/dms-core/app/utils/regional";

const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      saas: {
        stats: { mrr: "MRR", mrr_value: "{amount}", workspaces: "Workspaces" },
        seats: "no seat | {count} seat | {count} seats",
        retry: "Payment failed, retry {date}",
        failed: "Payment failed",
      },
    },
    fr: {
      saas: {
        stats: { mrr: "MRR", mrr_value: "{amount}", workspaces: "Espaces" },
        seats: "aucun siège | {count} siège | {count} sièges",
        retry: "Paiement refusé, nouvel essai {date}",
        failed: "Paiement refusé",
      },
    },
  },
});

let fetchedItems: unknown[] = [];

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async () => ({ items: fetchedItems }),
}));
vi.stubGlobal("useDmsRoute", () => reactive({ query: {} }));

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: () => ({}) }),
);

// The generic components only lay out what the block resolved: their props
// are what is checked here.
const propsProbe = (name: string, keys: string[]) => ({
  default: defineComponent({
    props: keys,
    setup: (props) => () =>
      h("pre", { "data-probe": name }, JSON.stringify(props)),
  }),
});
vi.mock("../layers/dms-ui/app/components/stat-group/StatGroup.vue", () =>
  propsProbe("stat-group", ["items"]),
);
vi.mock("../layers/dms-ui/app/components/key-value-list/KeyValueList.vue", () =>
  propsProbe("key-value-list", ["items"]),
);
vi.mock("../layers/dms-ui/app/components/banner/Banner.vue", () =>
  propsProbe("banner", ["title", "description"]),
);

const StatGroupBlock = (
  await import("../layers/dms-ui/app/components/blocks/StatGroupBlock.vue")
).default;
const KeyValueListBlock = (
  await import("../layers/dms-ui/app/components/blocks/KeyValueListBlock.vue")
).default;
const BannerBlock = (
  await import("../layers/dms-ui/app/components/blocks/BannerBlock.vue")
).default;

const SETTLE_MS = 50;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
const mounted: Array<{ unmount: () => void }> = [];

function render(component: Component, props: Record<string, unknown>) {
  const root = document.createElement("div");
  const app = createApp(component, props);
  app.mount(root);
  mounted.push(app);
  return () =>
    JSON.parse(
      (root.querySelector("[data-probe]")?.textContent ?? "{}").replace(
        /[\u00a0\u202f]/g,
        " ",
      ),
    );
}

const mrr = {
  key: "$saas.stats.mrr_value",
  params: { amount: { type: "money", value: 92200, currency: "EUR" } },
};
const seats = (value: number) => ({
  key: "saas.seats",
  params: { count: { type: "count", value } },
});

beforeEach(() => {
  i18n.global.locale.value = "en";
  fetchedItems = [];
  setRegionalPreferencesSource(() => ({ timeZone: "UTC" }));
  vi.stubGlobal("useI18n", () => ({
    t: i18n.global.t,
    locale: i18n.global.locale,
  }));
  vi.stubGlobal("useDmsCookie", () => ref<string[]>([]));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  setRegionalPreferencesSource(() => ({}));
});

describe("StatGroupBlock", () => {
  it("composes the label, the value and the detail of a cell", () => {
    const read = render(StatGroupBlock, {
      items: [
        { eyebrow: "$saas.stats.mrr", value: mrr, detail: seats(3) },
        { eyebrow: "Plain", value: 1284, detail: "As written" },
      ],
    });

    expect(read().items).toEqual([
      { eyebrow: "MRR", value: "€922.00", detail: "3 seats" },
      { eyebrow: "Plain", value: "1,284", detail: "As written" },
    ]);
  });

  it("composes the cells its route answers, in the reader's language", async () => {
    i18n.global.locale.value = "fr";
    fetchedItems = [
      {
        eyebrow: { key: "saas.stats.workspaces" },
        value: mrr,
        detail: seats(1),
      },
    ];
    const read = render(StatGroupBlock, { fetchUrl: "/api/billing-stats" });
    await settle();

    expect(read().items).toEqual([
      { eyebrow: "Espaces", value: "922,00 €", detail: "1 siège" },
    ]);
  });
});

describe("KeyValueListBlock", () => {
  it("composes labels, details and values, whatever the row's type", () => {
    const read = render(KeyValueListBlock, {
      card: false,
      items: [
        { label: { key: "saas.stats.mrr" }, value: mrr, type: "money" },
        { label: "Seats", value: seats(0), detail: { key: "saas.failed" } },
        { label: "Next invoice", value: 588, type: "money" },
        { label: "Plan", value: "$saas.stats.workspaces" },
      ],
    });

    expect(read().items).toEqual([
      { label: "MRR", value: "€922.00", type: "money" },
      { label: "Seats", value: "no seat", detail: "Payment failed" },
      { label: "Next invoice", value: 588, type: "money" },
      { label: "Plan", value: "Workspaces" },
    ]);
  });
});

describe("BannerBlock", () => {
  it("composes its title and description", () => {
    const read = render(BannerBlock, {
      title: { key: "saas.failed" },
      description: {
        key: "saas.retry",
        params: { date: { type: "date", value: "2026-10-10", format: "day" } },
      },
    });

    expect(read()).toEqual({
      title: "Payment failed",
      description: "Payment failed, retry Oct 10",
    });
  });

  it("keeps a plain title as written", () => {
    expect(render(BannerBlock, { title: "Beta" })().title).toBe("Beta");
  });
});

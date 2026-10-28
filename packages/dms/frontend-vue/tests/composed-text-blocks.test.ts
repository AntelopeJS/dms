/** @vitest-environment jsdom */
/**
 * StatGroup, KeyValueList and Banner draw a composed text wherever they draw
 * a text — from their options or from the JSON their route answers — in the
 * reader's language, and keep drawing plain strings as before.
 */
import { Suspense, createApp, h, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extraRuntime,
  provideExtraRuntime,
  registerTextBoundaries,
  plainSpaces,
} from "./helpers/chart-extra-runtime";
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

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function render(component: Component, props: Parameters<typeof createApp>[1]) {
  const root = document.createElement("div");
  const app = createApp(() =>
    h(Suspense, null, { default: () => h(component, props) }),
  );
  provideExtraRuntime(app);
  registerTextBoundaries(app);
  app.mount(root);
  mounted.push(app);
  return () => plainSpaces(root.textContent ?? "");
}

const mrr = {
  key: "$saas.stats.mrr_value",
  params: { amount: { type: "money", value: 92200, currency: "EUR" } },
};
const seats = (value: number) => ({
  key: "saas.seats",
  params: { count: { type: "count", value } },
});

beforeEach(() => extraRuntime(async () => ({ items: fetchedItems })));

beforeEach(() => {
  i18n.global.locale.value = "en";
  fetchedItems = [];
  setRegionalPreferencesSource(() => ({ timeZone: "UTC" }));
  vi.stubGlobal("useI18n", () => ({
    t: i18n.global.t,
    locale: i18n.global.locale,
  }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  setRegionalPreferencesSource(() => ({}));
  vi.unstubAllGlobals();
});

describe("StatGroupBlock", () => {
  it("composes the label, the value and the detail of a cell", () => {
    const read = render(StatGroupBlock, {
      items: [
        { eyebrow: "$saas.stats.mrr", value: mrr, detail: seats(3) },
        { eyebrow: "Plain", value: 1284, detail: "As written" },
      ],
    });

    expect(read()).toContain("MRR€922.003 seats");
    expect(read()).toContain("Plain1,284As written");
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

    expect(read()).toContain("Espaces922,00 €1 siège");
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

    expect(read()).toContain("MRR€922.00");
    expect(read()).toContain("Seatsno seatPayment failed");
    expect(read()).toContain("Next invoice€588.00");
    expect(read()).toContain("PlanWorkspaces");
  });
});

describe("BannerBlock", () => {
  it("composes its title and description", async () => {
    const read = render(BannerBlock, {
      title: { key: "saas.failed" },
      description: {
        key: "saas.retry",
        params: { date: { type: "date", value: "2026-10-10", format: "day" } },
      },
    });
    await flushPromises();

    expect(read().match(/Payment failed/g)).toHaveLength(2);
    expect(read()).toContain("Payment failed, retry Oct 10");
  });

  it("keeps a plain title as written", async () => {
    const read = render(BannerBlock, { title: "Beta" });
    await flushPromises();
    expect(read()).toContain("Beta");
  });
});

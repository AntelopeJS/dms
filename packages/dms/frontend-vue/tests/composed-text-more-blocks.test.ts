// @vitest-environment jsdom
/**
 * ActivityFeed, Meter, TopListCard and NavCardGrid draw a composed text
 * wherever they draw a text — from their options or from the JSON their
 * route answers — in the reader's language, and keep drawing plain and `$`
 * strings as before.
 */
import { createApp, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import {
  extraRuntime,
  mountExtra,
  plainSpaces,
  provideExtraRuntime,
  registerTextBoundaries,
} from "./helpers/chart-extra-runtime";
import { engine } from "./helpers/api-data-runtime";
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

let meterData: Record<string, unknown> | null = null;

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

function mount(component: Component, props: Record<string, unknown>) {
  const { root, app } = mountExtra(component, props);
  mounted.push(app);
  return root;
}

const count = (value: number) => ({ type: "count", value });

beforeEach(async () => {
  await extraRuntime(async () => meterData);
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  i18n.global.locale.value = "en";
  meterData = null;
  setRegionalPreferencesSource(() => ({ timeZone: "UTC" }));
  vi.stubGlobal("useI18n", () => ({
    t: i18n.global.t,
    locale: i18n.global.locale,
  }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  setRegionalPreferencesSource(() => ({}));
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

    const text = plainSpaces(root.textContent ?? "");
    expect(text).toContain("3 messages to review");
    expect(text).toContain("Sent 3 minutes ago · Inbox");
    expect(text).toContain("New");
    expect(text).toContain("1,284 bounced on Newsletter");
    expect(text).toContain("Signed in on Chrome on Windows");
    expect(text.match(/Chrome on Windows/g)).toHaveLength(2);
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

    expect(root.textContent).toContain("1 message à traiter");
    expect(root.textContent).toContain("Connexion sur Firefox sous Linux");
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
      legend: true,
    });

    const text = plainSpaces(root.textContent ?? "");
    expect(text).toContain("Médiathèque");
    expect(text).toContain("2 fichiers");
    expect(text).toContain("42 % sur 10 Go");
    expect(text).toContain("1 fichier");
    expect(text).toContain("Plain");
    expect(
      root.querySelector('[role="meter"]')?.getAttribute("aria-valuenow"),
    ).toBe("5");
    expect(
      [...root.querySelectorAll<HTMLElement>('[role="meter"] span[style]')].map(
        (segment) => segment.style.width,
      ),
    ).toEqual(["3%", "2%"]);
  });

  it("composes the texts its route answers", async () => {
    meterData = {
      value: 4,
      max: 10,
      hint: { key: "media.used", params: { size: "4 GB" } },
    };
    const root = mount(MeterBlock, { fetchUrl: "/api/storage" });

    await vi.waitFor(() => expect(root.textContent).toContain("4 GB used"));
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
  it("composes the title, description, tag, state and readout of a card", async () => {
    const app = createApp(NavCardGridBlock, {
      componentId: "navigation",
      pageId: "page",
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
    const runtime = provideExtraRuntime(app);
    await engine.installDmsPlugins(
      app,
      i18n.global,
      runtime,
      async () => ({}),
      ["en", "fr"],
    );
    registerTextBoundaries(app);
    const root = document.createElement("div");
    app.mount(root);
    mounted.push(app);

    const text = plainSpaces(root.textContent ?? "");
    expect(text).toContain("Library");
    expect(text.match(/New/g)).toHaveLength(2);
    expect(text).toContain("1,284 files");
    expect(text).toContain("4 GB used");
    expect(text).toContain("plain");
  });
});

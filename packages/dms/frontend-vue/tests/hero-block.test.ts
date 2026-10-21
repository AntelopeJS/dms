// @vitest-environment jsdom
/**
 * The Hero block draws its texts in the reader's language, highlights the
 * headline's `*words*` (or its `highlight`), caps its actions and figures,
 * and places an image or an icon composition beside or under the texts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type App, createApp, h } from "vue";
import { createI18n } from "vue-i18n";
import { splitHeadline } from "../layers/dms-ui/app/build/utils/heroHeadline";

const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      home: {
        eyebrow: "Welcome",
        title: "Hello {name}, meet *your dashboard*",
        lead: "Everything in one place.",
        alt: "The orders page",
      },
    },
    fr: { home: { eyebrow: "Bienvenue" } },
  },
});

const { default: HeroBlock } = await import(
  "../layers/dms-ui/app/components/blocks/HeroBlock.vue"
);

let app: App | undefined;
let host: HTMLDivElement;

function mount(props: Record<string, unknown>) {
  app = createApp({ setup: () => () => h(HeroBlock, props) });
  app.component("UIcon", (_, { attrs }) =>
    h("i", { ...attrs, "data-stub": "UIcon" }),
  );
  app.component("UButton", (_, { attrs }) =>
    h("a", { ...attrs, "data-stub": "UButton" }, String(attrs.label)),
  );
  app.mount(host);
}

beforeEach(() => {
  i18n.global.locale.value = "en";
  vi.stubGlobal("useI18n", () => ({
    t: i18n.global.t,
    locale: i18n.global.locale,
  }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

const ACTIONS = [
  { label: "Start", to: "/orders" },
  { label: "Guide", to: "https://example.com" },
  { label: "Pricing", to: "#pricing" },
  { label: "Fourth", to: "/fourth" },
];

describe("splitHeadline", () => {
  it("highlights the words in asterisks", () => {
    expect(splitHeadline("Every order, *one place*")).toEqual([
      { text: "Every order, ", isHighlighted: false },
      { text: "one place", isHighlighted: true },
    ]);
  });

  it("highlights the first occurrence of `highlight` without asterisks", () => {
    expect(splitHeadline("Sell more, sell faster", "sell")).toEqual([
      { text: "Sell more, ", isHighlighted: false },
      { text: "sell", isHighlighted: true },
      { text: " faster", isHighlighted: false },
    ]);
  });

  it("is one plain run when nothing is highlighted", () => {
    expect(splitHeadline("Plain", "absent")).toEqual([
      { text: "Plain", isHighlighted: false },
    ]);
    expect(splitHeadline("Plain")).toEqual([
      { text: "Plain", isHighlighted: false },
    ]);
  });
});

describe("HeroBlock", () => {
  it("composes its texts and highlights the headline's marked words", () => {
    mount({
      eyebrow: "$home.eyebrow",
      title: { key: "home.title", params: { name: "Ada" } },
      lead: "$home.lead",
    });

    const heading = host.querySelector("h2")!;
    expect(heading.textContent).toBe("Hello Ada, meet your dashboard");
    expect(heading.querySelector(".text-primary")?.textContent).toBe(
      "your dashboard",
    );
    expect(host.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
      heading.id,
    );
    expect(host.textContent).toContain("Welcome");
    expect(host.textContent).toContain("Everything in one place.");
  });

  it("follows a language switch", async () => {
    mount({ eyebrow: "$home.eyebrow", title: "Hi" });
    i18n.global.locale.value = "fr";
    await new Promise((resolve) => setTimeout(resolve));

    expect(host.textContent).toContain("Bienvenue");
  });

  it("shows three actions at most, the first one leading", () => {
    mount({ title: "Hi", actions: ACTIONS });

    const buttons = host.querySelectorAll("[data-stub=UButton]");
    expect([...buttons].map((button) => button.textContent)).toEqual([
      "Start",
      "Guide",
      "Pricing",
    ]);
    expect(buttons[0]?.getAttribute("variant")).toBe("solid");
    expect(buttons[1]?.getAttribute("variant")).toBe("outline");
  });

  it("lists its figures as terms, the value above its label", () => {
    mount({
      title: "Hi",
      proof: [
        { value: "2 min", label: "to set up" },
        { value: "99.9 %", label: "uptime" },
      ],
    });

    const entries = [...host.querySelectorAll("dl > div")].map((entry) => [
      entry.querySelector("dd")?.textContent?.trim(),
      entry.querySelector("dt")?.textContent?.trim(),
    ]);
    expect(entries).toEqual([
      ["2 min", "to set up"],
      ["99.9 %", "uptime"],
    ]);
  });

  it("describes its image, or hides a decorative one", () => {
    mount({ title: "Hi", image: "/media/orders.png", imageAlt: "$home.alt" });
    expect(host.querySelector("img")?.getAttribute("alt")).toBe(
      "The orders page",
    );
    app?.unmount();

    mount({ title: "Hi", image: "/media/orders.png" });
    expect(host.querySelector("img")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws no image from an unsafe address", () => {
    mount({ title: "Hi", image: "javascript:alert(1)" });
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-dms-hero-media]")).toBeNull();
  });

  it("draws an icon composition when there is no image", () => {
    mount({ title: "Hi", icons: ["i-ph-package", "i-ph-truck"] });

    expect(
      [...host.querySelectorAll("[data-stub=UIcon]")].map((icon) =>
        icon.getAttribute("name"),
      ),
    ).toEqual(["i-ph-package", "i-ph-truck"]);
  });

  it("puts the media beside the texts, or under them", () => {
    mount({ title: "Hi", icons: ["i-ph-package"] });
    const sideLayout = host.querySelector("section > div")!.className;
    expect(sideLayout).toContain("lg:grid-cols-");
    app?.unmount();

    mount({ title: "Hi", icons: ["i-ph-package"], mediaPosition: "below" });
    expect(host.querySelector("section > div")!.className).not.toContain(
      "lg:grid-cols-",
    );
  });

  it("frames itself after its background", () => {
    mount({ title: "Hi", background: "card" });
    expect(host.querySelector("section")?.className).toContain("dms-card");
    app?.unmount();

    mount({ title: "Hi", background: "gradient" });
    expect(host.querySelector("section")?.className).toContain("bg-linear-135");
  });
});

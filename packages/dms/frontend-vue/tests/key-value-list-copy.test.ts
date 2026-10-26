/** @vitest-environment jsdom */
/**
 * A KeyValueList row with `copy` draws a copy button next to its value, from
 * static items as from the items a `fetchUrl` answers; `copyValue` copies
 * another text than the one shown.
 */
import { createApp, defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { createI18n } from "vue-i18n";
import { stubBlockRuntime } from "./helpers/block-runtime";

const i18n = createI18n({
  legacy: false,
  locale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: { dms: { button: { copy: "Copy", copied: "Copied" } } } },
});

const copied: string[] = [];

let fetchedItems: unknown[] = [];

const KeyValueListBlock = (
  await import("../layers/dms-ui/app/components/blocks/KeyValueListBlock.vue")
).default;

const SETTLE_MS = 50;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
const mounted: Array<{ unmount: () => void }> = [];

function render(props: Record<string, unknown>): HTMLElement {
  const root = document.createElement("div");
  const app = createApp(KeyValueListBlock, { card: false, ...props });
  app.component("UIcon", defineComponent({ render: () => h("i") }));
  app.component("USkeleton", defineComponent({ render: () => h("span") }));
  app.mount(root);
  mounted.push(app);
  return root;
}

function copyButtons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>("button[title]")];
}

beforeEach(() => useRealDataEngine());

beforeEach(async () => {
  await stubBlockRuntime(async () => ({ items: fetchedItems }));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: (command: string) => {
      const selection =
        document.querySelector<HTMLTextAreaElement>("textarea[readonly]");
      if (command === "copy" && selection) copied.push(selection.value);
      return true;
    },
  });
  fetchedItems = [];
  copied.splice(0);
  vi.stubGlobal("useI18n", () => ({
    t: i18n.global.t,
    locale: i18n.global.locale,
  }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
});

describe("KeyValueList copy button", () => {
  it("copies the shown value of a row that asks for it, and only those", async () => {
    const root = render({
      items: [
        { label: "Endpoint", value: "https://api.example.com", copy: true },
        { label: "Plan", value: "Business" },
        { label: "Token", value: null, copy: true },
      ],
    });

    const buttons = copyButtons(root);
    expect(buttons).toHaveLength(1);
    buttons[0]!.click();
    await settle();
    expect(copied).toEqual(["https://api.example.com"]);
  });

  it("copies copyValue rather than the shown text, from fetched items", async () => {
    fetchedItems = [
      {
        label: "Thumbnail",
        value: "thumb.webp",
        copyValue: "https://cdn.example.com/media/42/thumb.webp",
      },
    ];
    const root = render({ fetchUrl: "/api/media/42/urls" });
    await settle();

    copyButtons(root)[0]!.click();
    await settle();
    expect(copied).toEqual(["https://cdn.example.com/media/42/thumb.webp"]);
  });
});

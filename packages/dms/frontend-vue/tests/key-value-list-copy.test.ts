// @vitest-environment jsdom
/**
 * A KeyValueList row with `copy` draws a copy button next to its value, from
 * static items as from the items a `fetchUrl` answers; `copyValue` copies
 * another text than the one shown.
 */
import { createApp, defineComponent, h, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

const i18n = createI18n({
  legacy: false,
  locale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: { dms: { button: { copy: "Copy", copied: "Copied" } } } },
});

const copied: string[] = [];

// jsdom has no clipboard: the button's copy lands in `copied` instead.
vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useClipboard: () => ({
    copy: async (text: string) => {
      copied.push(text);
    },
    copied: ref(false),
  }),
}));

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

beforeEach(() => {
  fetchedItems = [];
  copied.splice(0);
  vi.stubGlobal("useI18n", () => ({
    t: i18n.global.t,
    locale: i18n.global.locale,
  }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
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

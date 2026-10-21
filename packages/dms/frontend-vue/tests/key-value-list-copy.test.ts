// @vitest-environment jsdom
/**
 * A KeyValueList row with `copy` draws a copy button next to its value, from
 * static items as from the items a `fetchUrl` answers; `copyValue` copies
 * another text than the one shown. With `holdNavigation`, a fetched list
 * holds the page's Suspense until its rows are in.
 */
import {
  Suspense,
  createApp,
  defineComponent,
  h,
  reactive,
  ref,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
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
// When set, the route answers only once it resolves.
let fetchGate: Promise<void> | null = null;

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async () => {
    if (fetchGate) await fetchGate;
    return { items: fetchedItems };
  },
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

const UIcon = defineComponent({ render: () => h("i") });
const USkeleton = defineComponent({ render: () => h("span") });

function registerStubs(app: App): void {
  app.component("UIcon", UIcon);
  app.component("USkeleton", USkeleton);
}

function render(props: Record<string, unknown>): HTMLElement {
  const root = document.createElement("div");
  const app = createApp(KeyValueListBlock, { card: false, ...props });
  registerStubs(app);
  app.mount(root);
  mounted.push(app);
  return root;
}

function copyButtons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>("button[title]")];
}

beforeEach(() => useRealDataEngine());

beforeEach(() => {
  fetchedItems = [];
  fetchGate = null;
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

describe("KeyValueList holdNavigation", () => {
  // The page renders its blocks under a Suspense, which a client navigation
  // waits for.
  function renderInPage(props: Record<string, unknown>) {
    const root = document.createElement("div");
    let isResolved = false;
    const app = createApp(() =>
      h(
        Suspense,
        { onResolve: () => (isResolved = true) },
        { default: () => h(KeyValueListBlock, { card: false, ...props }) },
      ),
    );
    registerStubs(app);
    app.mount(root);
    mounted.push(app);
    return { root, isResolved: () => isResolved };
  }

  it("holds the page until its rows are in, then shows them at once", async () => {
    let answer!: () => void;
    fetchGate = new Promise((resolve) => (answer = resolve));
    fetchedItems = [{ label: "Plan", value: "Business" }];
    const page = renderInPage({ fetchUrl: "/api/plan", holdNavigation: true });
    await settle();
    expect(page.isResolved()).toBe(false);

    answer();
    await settle();
    expect(page.isResolved()).toBe(true);
    expect(page.root.textContent).toContain("Business");
  });

  it("lets the page show at once without it, the rows loading after", async () => {
    fetchGate = new Promise(() => {});
    const page = renderInPage({ fetchUrl: "/api/plan" });
    await settle();
    expect(page.isResolved()).toBe(true);
  });
});

// @vitest-environment jsdom
/**
 * A drawer's or a modal's backdrop lets clicks through to the page as soon
 * as the container starts closing, and fades out quickly (at once with
 * reduced motion), while the panel itself still animates out. The overlay's
 * classes are compiled by Tailwind and applied to a backdrop that carries
 * reka's inline `pointer-events: auto`, as the real one does.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  reactive,
  ref,
  watch,
  type App,
  type Component,
} from "vue";
import { compile } from "tailwindcss";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { CLOSING_OVERLAY_CLASS } from "../layers/dms-ui/app/build/components/containers/constants";

vi.mock("reka-ui", () => {
  const passThrough = defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        h("div", slots.default?.()),
  });
  return {
    DialogTitle: passThrough,
    DialogDescription: passThrough,
    VisuallyHidden: passThrough,
  };
});

const require = createRequire(import.meta.url);
let overlayCss = "";

let app: App | undefined;
let host: HTMLDivElement;

// Renders the container's backdrop as reka does: `data-state` follows the
// open state and an inline style keeps the backdrop clickable.
const ContainerStub = defineComponent({
  props: { open: Boolean, ui: Object },
  emits: ["update:open"],
  setup(props, { slots }) {
    return () =>
      h("div", [
        h("div", {
          "data-slot": "overlay",
          "data-state": props.open ? "open" : "closed",
          class: (props.ui as Record<string, string> | undefined)?.overlay,
          style: { pointerEvents: "auto" },
        }),
        h("div", { "data-slot": "content" }, [
          slots.header?.(),
          slots.body?.(),
        ]),
      ]);
  },
});

const passThroughStub = defineComponent({
  setup:
    (_props, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function mountContainer(
  container: Component,
  props: Record<string, unknown> = {},
): Promise<void> {
  const isOpen = ref(true);
  app = createApp({
    setup: () => () =>
      h(container, {
        title: "Customer",
        containerId: "container-1",
        component: defineComponent({ render: () => null }),
        open: isOpen.value,
        "onUpdate:open": (value: boolean) => (isOpen.value = value),
        ...props,
      }),
  });
  app.component("UDrawer", ContainerStub);
  app.component("UModal", ContainerStub);
  app.component("UContainer", passThroughStub);
  app.component("UButton", (buttonProps: Record<string, unknown>) =>
    h("button", { ...buttonProps }),
  );
  app.component("USkeleton", () => h("span"));
  app.mount(host);
  await nextTick();
}

async function closeContainer(): Promise<void> {
  host.querySelector<HTMLButtonElement>("button[aria-label='Close']")!.click();
  await vi.waitFor(() => expect(overlay().dataset.state).toBe("closed"));
}

const overlay = () => host.querySelector<HTMLElement>("[data-slot='overlay']")!;
const pointerEvents = () => getComputedStyle(overlay()).pointerEvents;

beforeAll(async () => {
  const compiler = await compile('@import "tailwindcss/utilities.css";', {
    base: process.cwd(),
    loadStylesheet: async (id: string, base: string) => {
      const path = require.resolve(id);
      return { path, base, content: await readFile(path, "utf8") };
    },
  });
  overlayCss = compiler.build(CLOSING_OVERLAY_CLASS.split(" "));
});

beforeEach(() => {
  const style = document.createElement("style");
  style.textContent = overlayCss;
  document.head.append(style);
  host = document.createElement("div");
  document.body.append(host);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("provide", provide);
  vi.stubGlobal("useDmsCookie", () => ref(null));
  vi.stubGlobal("useLeaveGuard", () => ({
    executeGuards: async () => true,
    clearGuards: vi.fn(),
  }));
  vi.stubGlobal("useDmsRoute", () => reactive({ path: "/" }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  document.head.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the closing overlay's styles", () => {
  it("stops intercepting pointer events once closed, overriding reka's inline style", () => {
    expect(overlayCss).toMatch(
      /\[data-state="closed"\] \{\s*pointer-events: none !important;/,
    );
  });

  it("fades out in 100ms, past vaul's unlayered half-second", () => {
    expect(overlayCss).toMatch(
      /\[data-state="closed"\] \{\s*animation-duration: 100ms !important;/,
    );
  });

  it("does not fade out at all with reduced motion", () => {
    expect(overlayCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\[data-state="closed"\] \{\s*animation: none !important;/,
    );
  });

  it("keeps the opening fade untouched", () => {
    expect(overlayCss).not.toContain('[data-state="open"]');
  });
});

type ContainerLoader = () => Promise<{ default: Component }>;

const loadDrawer: ContainerLoader = () =>
  import(
    "../layers/dms-ui/app/build/components/containers/drawer/DynamicDrawer.vue"
  );
const loadModal: ContainerLoader = () =>
  import(
    "../layers/dms-ui/app/build/components/containers/modal/DynamicModal.vue"
  );

const CONTAINERS: Array<[string, ContainerLoader, Record<string, unknown>]> = [
  ["side drawer", loadDrawer, { direction: "right" }],
  ["bottom drawer", loadDrawer, { direction: "bottom" }],
  ["modal", loadModal, {}],
];

describe.each(CONTAINERS)("a %s's backdrop", (_name, load, props) => {
  async function mountIt(): Promise<void> {
    const { default: container } = await load();
    await mountContainer(container, props);
  }

  it("blocks the page while the container is open", async () => {
    await mountIt();
    expect(overlay().dataset.state).toBe("open");
    expect(pointerEvents()).toBe("auto");
  });

  it("lets a click through to the page as soon as it closes", async () => {
    await mountIt();
    await closeContainer();
    expect(pointerEvents()).toBe("none");
  });
});

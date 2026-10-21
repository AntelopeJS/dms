// @vitest-environment jsdom
/**
 * A drawer or a modal gives the page its clicks back as soon as it starts
 * closing, not once its panel has finished animating out. Reka sets
 * `pointer-events: none` on the body while a modal layer is mounted, and the
 * layer stays mounted through the exit animation: the containers stub the
 * Nuxt UI component with reka's real dialog (the copy Nuxt UI pins, which
 * vaul and UModal run on), its content force-mounted as it is while the
 * panel slides or scales away.
 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The layer's own reka copy only draws the titles here.
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

// Nuxt UI exports no `package.json`: its installed directory, resolved.
const nuxtUiDir = realpathSync(join(process.cwd(), "node_modules/@nuxt/ui"));
const nuxtUiRequire = createRequire(join(nuxtUiDir, "package.json"));
const { DialogContent, DialogRoot } = (await import(
  pathToFileURL(nuxtUiRequire.resolve("reka-ui")).href
)) as typeof import("reka-ui");

let app: App | undefined;
let host: HTMLDivElement;
let outside: HTMLButtonElement;
let closeRequests: number;

// UDrawer / UModal as Nuxt UI draws them when not dismissible: reka's dialog,
// its `content` props bound on the content, a press outside asking to close.
const ContainerStub = defineComponent({
  props: { open: Boolean, content: Object },
  emits: ["update:open", "close:prevent"],
  setup(props, { slots, emit }) {
    return () =>
      h(
        DialogRoot,
        {
          open: props.open,
          "onUpdate:open": (value: boolean) => emit("update:open", value),
        },
        () =>
          h(
            DialogContent,
            {
              forceMount: true,
              "data-slot": "content",
              ...props.content,
              onPointerDownOutside: (event: Event) => {
                event.preventDefault();
                emit("close:prevent");
              },
            },
            () => [slots.header?.(), slots.body?.()],
          ),
      );
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
        "onClose:prevent": () => closeRequests++,
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
  // Reka listens for a press outside from the next task on.
  await vi.advanceTimersByTimeAsync(0);
}

const bodyPointerEvents = () => document.body.style.pointerEvents;

function pointer(type: string, target: Element): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 500,
    }),
  );
}

beforeEach(() => {
  // Timeouts only: Vue drops a listener's events stamped before it was
  // attached, which a faked `performance` clock would make every event.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  host = document.createElement("div");
  outside = document.createElement("button");
  outside.textContent = "Another row";
  document.body.append(host, outside);
  document.body.style.pointerEvents = "";
  closeRequests = 0;
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
  outside.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

describe.each(CONTAINERS)("closing a %s", (_name, load, props) => {
  it("blocks the page's pointer events while it is open", async () => {
    const { default: container } = await load();
    await mountContainer(container, props);
    expect(bodyPointerEvents()).toBe("none");
  });

  it("gives them back as soon as it starts closing, while still mounted", async () => {
    const { default: container } = await load();
    await mountContainer(container, props);
    host
      .querySelector<HTMLButtonElement>("button[aria-label='Close']")!
      .click();
    await vi.advanceTimersByTimeAsync(0);
    // Still on the page, as during its exit animation.
    expect(host.querySelector("[data-slot='content']")).not.toBeNull();
    expect(bodyPointerEvents()).toBe("");
  });
});

describe("a drawer resized by its handle", () => {
  async function resize(): Promise<void> {
    const { default: DynamicDrawer } = await loadDrawer();
    await mountContainer(DynamicDrawer, { direction: "right" });
    const handle = host.querySelector("[data-dms-drawer-handle]")!;
    pointer("pointerdown", handle);
    pointer("pointermove", handle);
    pointer("pointerup", handle);
    await vi.advanceTimersByTimeAsync(0);
  }

  it("closes on the first press outside it after the resize", async () => {
    await resize();
    pointer("pointerdown", outside);
    await vi.advanceTimersByTimeAsync(0);
    expect(closeRequests).toBe(1);
  });

  it("is not closed by the resize itself", async () => {
    await resize();
    expect(closeRequests).toBe(0);
  });
});

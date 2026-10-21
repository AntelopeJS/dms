// @vitest-environment jsdom
/**
 * A drawer or a modal gives the page its clicks back as soon as it starts
 * closing, not once its panel has finished animating out. Reka sets
 * `pointer-events: none` on the body twice while a modal layer is mounted --
 * from the content's dismissable layer and from the backdrop's scroll lock --
 * and both stay mounted through their exit animations: the containers stub
 * the Nuxt UI component with reka's real dialog (the copy Nuxt UI pins, which
 * vaul and UModal run on), its content force-mounted as it is while the
 * panel slides or scales away, and a backdrop that holds the page as reka's
 * scroll lock does from 2.11 on. The page is given back by the observer the
 * DMS installs on every page, whoever renders the dialog: a plain reka dialog
 * stands for UModal, USlideover and the confirm dialogs.
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
  onBeforeUnmount,
  provide,
  reactive,
  ref,
  watch,
  type App,
  type Component,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UNCOVERED_ATTRIBUTE,
  watchClosingLayers,
} from "../layers/dms-ui/app/build/composables/containers/closingLayers";

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

// The backdrop's scroll lock, as reka 2.11 holds it (an owner of the body's
// pointer events, which a layer letting go no longer clears): the page is
// blocked from the backdrop's mount until it unmounts, after its fade.
const BackdropStub = defineComponent({
  setup() {
    document.body.style.pointerEvents = "none";
    onBeforeUnmount(() => (document.body.style.pointerEvents = ""));
    return () => h("div", { "data-slot": "overlay" });
  },
});

let app: App | undefined;
let host: HTMLDivElement;
let outside: HTMLButtonElement;
let closeRequests: number;
let stopReleasing: () => void;

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
        () => [
          h(BackdropStub),
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
        ],
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
  stopReleasing = watchClosingLayers(document);
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
  stopReleasing();
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
    // Still on the page, as during their exit animations.
    expect(host.querySelector("[data-slot='content']")).not.toBeNull();
    expect(host.querySelector("[data-slot='overlay']")).not.toBeNull();
    expect(bodyPointerEvents()).toBe("");
  });

  it("keeps them blocked while another container stays open", async () => {
    const { default: container } = await load();
    const below = document.createElement("div");
    document.body.append(below);
    const belowApp = createApp(() =>
      h(container, {
        ...props,
        title: "Below",
        containerId: "container-below",
        component: defineComponent({ render: () => null }),
        open: true,
      }),
    );
    belowApp.component("UDrawer", ContainerStub);
    belowApp.component("UModal", ContainerStub);
    belowApp.component("UContainer", passThroughStub);
    belowApp.component("UButton", () => h("button"));
    belowApp.component("USkeleton", () => h("span"));
    belowApp.mount(below);
    try {
      await mountContainer(container, props);
      host
        .querySelector<HTMLButtonElement>("button[aria-label='Close']")!
        .click();
      await vi.advanceTimersByTimeAsync(0);
      expect(bodyPointerEvents()).toBe("none");
    } finally {
      belowApp.unmount();
      below.remove();
    }
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

// UModal or USlideover used directly, a confirm dialog: reka's dialog with
// its defaults, the content holding the page until it has scaled out (kept
// mounted here, as through its exit animation).
describe("closing any other dialog", () => {
  function mountDialog(isOpen: Ref<boolean>, target: HTMLElement): App {
    const dialog = createApp(() =>
      h(DialogRoot, { open: isOpen.value }, () => [
        h(BackdropStub),
        h(DialogContent, { forceMount: true }, () => "Save the view"),
      ]),
    );
    dialog.mount(target);
    return dialog;
  }

  it("gives the page its clicks back as soon as it starts closing", async () => {
    const isOpen = ref(true);
    app = mountDialog(isOpen, host);
    await nextTick();
    expect(bodyPointerEvents()).toBe("none");
    isOpen.value = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(host.querySelector("[role='dialog']")).not.toBeNull();
    expect(bodyPointerEvents()).toBe("");
  });

  it("keeps the page blocked while a dialog below stays open", async () => {
    const below = document.createElement("div");
    document.body.append(below);
    const belowApp = mountDialog(ref(true), below);
    try {
      const isOpen = ref(true);
      app = mountDialog(isOpen, host);
      await nextTick();
      isOpen.value = false;
      await vi.advanceTimersByTimeAsync(0);
      expect(bodyPointerEvents()).toBe("none");
    } finally {
      belowApp.unmount();
      below.remove();
    }
  });

  it("leaves the page blocked without the observer, as reka alone does", async () => {
    stopReleasing();
    const isOpen = ref(true);
    app = mountDialog(isOpen, host);
    await nextTick();
    isOpen.value = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(bodyPointerEvents()).toBe("none");
  });
});

// A confirm closing over a drawer that stays open: reka disables the drawer's
// layer until the confirm has unmounted, so the drawer is marked for its
// theme to give it its clicks back, the page staying blocked.
describe("a dialog closing over one that stays open", () => {
  const mounted: Array<[App, HTMLElement]> = [];

  function mountDialog(isOpen: Ref<boolean>, title: string): App {
    const target = document.createElement("div");
    document.body.append(target);
    const dialog = createApp(() =>
      h(DialogRoot, { open: isOpen.value }, () => [
        h(BackdropStub),
        h(DialogContent, { forceMount: true }, () => title),
      ]),
    );
    dialog.mount(target);
    mounted.push([dialog, target]);
    return dialog;
  }

  const layer = (title: string) =>
    [...document.querySelectorAll("[role='dialog']")].find(
      (dialog) => dialog.textContent === title,
    )!;
  const isUncovered = (title: string) =>
    layer(title).hasAttribute(UNCOVERED_ATTRIBUTE);

  async function closeConfirmOverDrawer(): Promise<App> {
    mountDialog(ref(true), "Drawer");
    const isOpen = ref(true);
    const confirm = mountDialog(isOpen, "Discard changes?");
    await vi.advanceTimersByTimeAsync(0);
    isOpen.value = false;
    await vi.advanceTimersByTimeAsync(0);
    return confirm;
  }

  afterEach(() => {
    for (const [dialog, target] of mounted.splice(0)) {
      dialog.unmount();
      target.remove();
    }
  });

  it("gives the dialog below its clicks back while it animates out", async () => {
    await closeConfirmOverDrawer();
    expect(isUncovered("Drawer")).toBe(true);
    expect(isUncovered("Discard changes?")).toBe(false);
    expect(bodyPointerEvents()).toBe("none");
  });

  it("lets reka take over once it has unmounted", async () => {
    const confirm = await closeConfirmOverDrawer();
    confirm.unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(isUncovered("Drawer")).toBe(false);
  });

  it("covers the dialog below again when another one opens above it", async () => {
    await closeConfirmOverDrawer();
    mountDialog(ref(true), "Send again?");
    await vi.advanceTimersByTimeAsync(0);
    expect(isUncovered("Drawer")).toBe(false);
    expect(isUncovered("Send again?")).toBe(false);
  });

  it("marks nothing when no dialog stays open", async () => {
    const isOpen = ref(true);
    mountDialog(isOpen, "Save the view");
    await vi.advanceTimersByTimeAsync(0);
    isOpen.value = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector(`[${UNCOVERED_ATTRIBUTE}]`)).toBeNull();
  });
});

// A click on the page while a dialog closes may open another one: the one
// closing gives the focus back to its trigger only when nothing opened since.
describe("a dialog unmounting after its close", () => {
  let trigger: HTMLButtonElement;
  const mounted: Array<[App, HTMLElement]> = [];

  function mountDialog(isOpen: Ref<boolean>): App {
    const target = document.createElement("div");
    document.body.append(target);
    const dialog = createApp(() =>
      h(DialogRoot, { open: isOpen.value }, () => [
        h(DialogContent, { forceMount: true }, () => h("button", "Cancel")),
      ]),
    );
    dialog.mount(target);
    mounted.push([dialog, target]);
    return dialog;
  }

  // Closes the first dialog, runs `meanwhile`, then lets it finish unmounting.
  async function closeThenUnmount(meanwhile: () => void): Promise<void> {
    const isOpen = ref(true);
    const dialog = mountDialog(isOpen);
    await vi.advanceTimersByTimeAsync(0);
    isOpen.value = false;
    await vi.advanceTimersByTimeAsync(0);
    meanwhile();
    await vi.advanceTimersByTimeAsync(0);
    dialog.unmount();
    await vi.advanceTimersByTimeAsync(0);
  }

  beforeEach(() => {
    trigger = document.createElement("button");
    trigger.textContent = "Save current view";
    document.body.append(trigger);
    trigger.focus();
  });

  afterEach(() => {
    for (const [dialog, target] of mounted.splice(0)) {
      dialog.unmount();
      target.remove();
    }
    trigger.remove();
  });

  it("gives the focus back to its trigger when nothing opened since", async () => {
    await closeThenUnmount(() => {});
    expect(document.activeElement).toBe(trigger);
  });

  it("leaves it alone once a click on the page opened another one", async () => {
    // Focus landing on the trigger is outside the new drawer or modal, which
    // Nuxt UI then asks to close when it is not dismissible.
    const triggerFocus = vi.fn();
    trigger.addEventListener("focus", triggerFocus);
    await closeThenUnmount(() => mountDialog(ref(true)));
    expect(triggerFocus).not.toHaveBeenCalled();
  });

  it("gives it back when closing over one that stays open", async () => {
    // A confirm opened from a button in a drawer that stays open.
    mountDialog(ref(true));
    await vi.advanceTimersByTimeAsync(0);
    const inDrawer = mounted[0]![1].querySelector("button")!;
    inDrawer.focus();
    await closeThenUnmount(() => {});
    expect(document.activeElement).toBe(inDrawer);
  });
});

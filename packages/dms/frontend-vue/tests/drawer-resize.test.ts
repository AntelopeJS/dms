// @vitest-environment jsdom
/**
 * Every drawer is resizable from `lg`: a handle on its inner edge (the width
 * of a side drawer, the height of a top or bottom one), driven by the pointer
 * or the keyboard, the size remembered per drawer key in a cookie.
 */
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
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWER_SIZE_COOKIE,
  readDrawerSizePreferences,
} from "../layers/dms-ui/app/build/composables/containers/drawerSize";

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

const SIZE_VARIABLE = "--dms-drawer-size";

let app: App | undefined;
let host: HTMLDivElement;
let cookies: Map<string, Ref<unknown>>;
// What the stubbed drawer renders at: its rendered width and height.
let renderedRect: { width: number; height: number };

const rendered = reactive<{ ui?: Record<string, string> }>({});

function useDmsCookie<T>(
  name: string,
  options: { default?: () => unknown } = {},
): Ref<T> {
  if (!cookies.has(name)) cookies.set(name, ref(options.default?.() ?? null));
  return cookies.get(name) as Ref<T>;
}

const storedSizes = () =>
  readDrawerSizePreferences(cookies.get(DRAWER_SIZE_COOKIE)?.value);

const DrawerStub = defineComponent({
  props: { direction: String, ui: Object, content: Object },
  setup(props, { slots }) {
    return () => {
      rendered.ui = props.ui as Record<string, string> | undefined;
      const style = (props.content as { style?: Record<string, string> })
        ?.style;
      return h("div", { "data-slot": "content", style }, [
        slots.header?.(),
        slots.body?.(),
      ]);
    };
  },
});

async function mountDrawer(props: Record<string, unknown>): Promise<void> {
  app?.unmount();
  host.replaceChildren();
  const { default: DynamicDrawer } = await import(
    "../layers/dms-ui/app/build/components/containers/drawer/DynamicDrawer.vue"
  );
  app = createApp({
    setup: () => () =>
      h(DynamicDrawer, {
        title: "Order",
        containerId: "drawer-1",
        component: defineComponent({ render: () => null }),
        ...props,
      }),
  });
  app.component("UDrawer", DrawerStub);
  app.component(
    "UContainer",
    defineComponent({
      setup:
        (_props, { slots }) =>
        () =>
          h("div", slots.default?.()),
    }),
  );
  app.component("UButton", () => h("button"));
  app.component("USkeleton", () => h("span"));
  app.mount(host);
  await nextTick();
}

const content = () => host.querySelector<HTMLElement>("[data-slot='content']")!;
const handle = () =>
  host.querySelector<HTMLElement>("[data-dms-drawer-handle]")!;
const drawerSize = () => content().style.getPropertyValue(SIZE_VARIABLE);

const press = async (key: string) => {
  handle().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  await nextTick();
};

const pointer = (type: string, clientX: number, clientY = 0) =>
  new MouseEvent(type, { clientX, clientY, bubbles: true });

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  cookies = new Map();
  renderedRect = { width: 600, height: 320 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ ...renderedRect }) as DOMRect,
  );
  window.innerWidth = 1600;
  window.innerHeight = 1000;
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("provide", provide);
  vi.stubGlobal("useDmsCookie", useDmsCookie);
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a side drawer's width", () => {
  it("opens at 600px from lg without a size, the handle a vertical separator", async () => {
    await mountDrawer({ direction: "right", sizeKey: "orders" });
    expect(drawerSize()).toBe("600px");
    expect(rendered.ui?.content).toContain("lg:w-(--dms-drawer-size)");
    expect(handle().getAttribute("role")).toBe("separator");
    expect(handle().getAttribute("aria-orientation")).toBe("vertical");
    expect(handle().getAttribute("aria-valuenow")).toBe("600");
    expect(handle().getAttribute("aria-valuemin")).toBe("360");
    expect(handle().getAttribute("aria-valuemax")).toBe("1440");
    expect(handle().getAttribute("aria-label")).toBe("dms.drawer.resize");
    expect(handle().className).toContain("lg:block");
    expect(handle().className).toContain("hidden");
  });

  it("clamps the 600px to a narrow window", async () => {
    window.innerWidth = 600;
    await mountDrawer({ direction: "right" });
    expect(drawerSize()).toBe("540px");
  });

  it("keeps the preset width of an explicit size", async () => {
    await mountDrawer({ direction: "left", size: "3xl" });
    expect(drawerSize()).toBe("768px");
    expect(rendered.ui?.content).toContain("w-3xl");
    expect(rendered.ui?.content).toContain("max-sm:w-full");
  });

  it("follows a drag of its handle and remembers the width under its key", async () => {
    await mountDrawer({ direction: "right", sizeKey: "orders" });
    handle().dispatchEvent(pointer("pointerdown", 500));
    handle().dispatchEvent(pointer("pointermove", 380));
    await nextTick();
    expect(drawerSize()).toBe("720px");
    expect(handle().dataset.dragging).toBe("true");
    handle().dispatchEvent(pointer("pointerup", 380));
    await nextTick();
    expect(storedSizes().widths).toEqual({ orders: 720 });

    await mountDrawer({ direction: "right", sizeKey: "orders" });
    expect(drawerSize()).toBe("720px");
    await mountDrawer({ direction: "right", sizeKey: "invoices" });
    expect(drawerSize()).toBe("600px");
  });

  it("resizes from the keyboard, and resets on a double-click", async () => {
    await mountDrawer({ direction: "right", sizeKey: "orders" });
    await press("ArrowLeft");
    expect(drawerSize()).toBe("616px");
    await press("ArrowRight");
    await press("ArrowRight");
    expect(drawerSize()).toBe("584px");
    await press("End");
    expect(drawerSize()).toBe("1440px");
    await press("Home");
    expect(storedSizes().widths.orders).toBe(360);
    handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await nextTick();
    expect(drawerSize()).toBe("600px");
  });

  it("keeps an explicit size's stored width once resized", async () => {
    await mountDrawer({ direction: "right", size: "xl", sizeKey: "skills" });
    expect(drawerSize()).toBe("576px");
    await press("ArrowLeft");
    await mountDrawer({ direction: "right", size: "xl", sizeKey: "skills" });
    expect(drawerSize()).toBe("592px");
  });

  it("keeps the drawer's own drag off its handle", async () => {
    await mountDrawer({ direction: "right" });
    const onContentPointerDown = vi.fn();
    content().addEventListener("pointerdown", onContentPointerDown);
    handle().dispatchEvent(pointer("pointerdown", 500));
    expect(onContentPointerDown).not.toHaveBeenCalled();
  });
});

describe("a bottom drawer's height", () => {
  it("keeps its natural height until resized", async () => {
    await mountDrawer({ sizeKey: "new-order" });
    expect(drawerSize()).toBe("");
    expect(rendered.ui?.content).toBeUndefined();
    expect(handle().getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("grows from its top edge and remembers its height", async () => {
    await mountDrawer({ sizeKey: "new-order" });
    handle().dispatchEvent(pointer("pointerdown", 0, 600));
    handle().dispatchEvent(pointer("pointermove", 0, 500));
    handle().dispatchEvent(pointer("pointerup", 0, 500));
    await nextTick();
    expect(drawerSize()).toBe("420px");
    expect(rendered.ui?.content).toBe("lg:h-(--dms-drawer-size)");
    expect(storedSizes().heights).toEqual({ "new-order": 420 });

    await mountDrawer({ sizeKey: "new-order" });
    expect(drawerSize()).toBe("420px");
  });

  it("resizes from the keyboard, stops at 90% of the window, and resets", async () => {
    await mountDrawer({ sizeKey: "new-order" });
    await press("ArrowUp");
    expect(drawerSize()).toBe("336px");
    await press("End");
    expect(drawerSize()).toBe("900px");
    handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await nextTick();
    expect(drawerSize()).toBe("");
    expect(storedSizes().heights).toEqual({});
  });
});

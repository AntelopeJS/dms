/** @vitest-environment jsdom */
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
  inject,
  nextTick,
  provide,
  shallowRef,
  reactive,
  ref,
  watch,
  type App,
  type Component,
  type InjectionKey,
  type Ref,
  type VNode,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  componentSizeKey,
  DRAWER_SIZE_COOKIE,
  readDrawerSizePreferences,
} from "../layers/dms-ui/app/build/composables/containers/drawerSize";

import { DialogRoot } from "reka-ui";
import type { DrawerOptions } from "../layers/dms-ui/app/composables/containers/types";
import type { formFieldInjectionKey as FormFieldKey } from "@nuxt/ui/composables/useFormField";

type FieldInjection =
  typeof FormFieldKey extends InjectionKey<infer Value> ? Value : never;
type DrawerProps = NonNullable<VNode["props"]>;

interface BodyInjections {
  explorer?: string | null;
  containerId?: string;
  formField?: FieldInjection | null;
}

const SIZE_VARIABLE = "--dms-drawer-size";

let app: App | undefined;
let host: HTMLDivElement;
let cookies: Map<string, Ref<unknown>>;

let renderedRect = { width: 600, height: 320 };

const rendered = reactive<{
  ui?: Record<string, string>;
  handle?: boolean;
  dismissible?: boolean;
}>({});

function useDmsCookie<T>(
  name: string,
  options: { default?: () => T } = {},
): Ref<T> {
  if (!cookies.has(name)) cookies.set(name, ref(options.default?.() ?? null));
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This cookie double stores unvalidated values including null; it mirrors the generic cookie API rather than claiming the stored value was validated as T.
  return cookies.get(name) as Ref<T>;
}

const storedSizes = () =>
  readDrawerSizePreferences(cookies.get(DRAWER_SIZE_COOKIE)?.value);

const DrawerStub = defineComponent({
  props: {
    direction: String,
    ui: Object,
    content: Object,
    handle: { type: Boolean, default: true },
    dismissible: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    return () => {
      rendered.ui = props.ui;
      rendered.handle = props.handle;
      rendered.dismissible = props.dismissible;
      const style = props.content?.style;
      return h(DialogRoot, null, () =>
        h("div", { "data-slot": "content", style }, [
          slots.header?.(),
          slots.body?.(),
        ]),
      );
    };
  },
});

async function mountDrawer(props: DrawerProps): Promise<void> {
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
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This geometry double intentionally returns only width and height, the fields resizing reads; it is not a complete DOMRect.
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
  });

  it("leaves the same backdrop strip on a phone, sized or not", async () => {
    await mountDrawer({ direction: "right", size: "3xl" });
    expect(rendered.ui?.content).not.toMatch(/max-sm:|max-w-full/);
    await mountDrawer({ direction: "right" });
    expect(rendered.ui?.content).not.toMatch(/max-sm:|max-w-full/);
  });

  it("fills a phone's screen at size full only", async () => {
    await mountDrawer({ direction: "right", size: "full" });
    expect(rendered.ui?.content).toContain("w-full max-w-full rounded-none");
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

  it("draws no grip of its own: a side drawer is not dragged away", async () => {
    await mountDrawer({ direction: "right" });
    expect(rendered.handle).toBe(false);
    expect(handle().className).toContain("lg:block");
  });

  it("scrolls its body under a header that stays in view", async () => {
    await mountDrawer({ direction: "right" });
    expect(rendered.ui?.container).toContain("overflow-y-hidden");
    expect(rendered.ui?.body).toContain("overflow-y-auto");
    expect(rendered.ui?.body).toContain("min-h-0");
  });

  it("keeps the drawer's own drag off its handle without swallowing the press", async () => {
    await mountDrawer({ direction: "right" });
    const onContentPointerDown = vi.fn();
    content().addEventListener("pointerdown", onContentPointerDown);
    handle().dispatchEvent(pointer("pointerdown", 500));
    expect(rendered.dismissible).toBe(false);
    expect(onContentPointerDown).toHaveBeenCalledOnce();
  });
});

describe("a bottom drawer's height", () => {
  it("keeps the drawer's own grip below lg, where there is no handle", async () => {
    await mountDrawer({ sizeKey: "new-order" });
    expect(rendered.handle).toBe(true);
    expect(rendered.ui?.handle).toBe("lg:hidden!");
  });

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

describe("a drawer opened through useDrawer", () => {
  const editorOptions = {
    name: undefined,
    __name: "KeyEditor",
    render: () => null,
  };
  const SetupEditor = defineComponent(editorOptions);

  async function openThroughUseDrawer(options: Partial<DrawerOptions>) {
    const create = vi.fn(
      (_component: Component, _options: { props: DrawerOptions }) => ({
        open: () => new Promise(() => {}),
        close: vi.fn(),
        patch: vi.fn(),
      }),
    );
    vi.stubGlobal("useOverlay", () => ({ create }));
    vi.stubGlobal("markRaw", <T>(value: T) => value);
    const { useDrawer } = await import(
      "../layers/dms-ui/app/composables/containers/useDrawer"
    );
    useDrawer().open({ title: "Key", component: SetupEditor, ...options });
    const [, createOptions] = create.mock.calls[0];
    return createOptions.props;
  }

  it("keeps its size under its component's name without a key", async () => {
    const props = await openThroughUseDrawer({});
    expect(props.sizeKey).toBe("component:KeyEditor");
  });

  it("prefers the size key, then the container id", async () => {
    expect((await openThroughUseDrawer({ sizeKey: "keys" })).sizeKey).toBe(
      "keys",
    );
    expect(
      (await openThroughUseDrawer({ containerId: "key-editor" })).sizeKey,
    ).toBe("key-editor");
  });

  it("reopens at the size given to the same component", async () => {
    const sizeKey = componentSizeKey(SetupEditor)!;
    await mountDrawer({ direction: "right", sizeKey });
    await press("ArrowLeft");
    await mountDrawer({ direction: "right", sizeKey });
    expect(drawerSize()).toBe("616px");
    expect(storedSizes().widths).toEqual({ [sizeKey]: 616 });
  });

  it("names no key for an anonymous or async-wrapped component", () => {
    expect(componentSizeKey({ render: () => null })).toBeUndefined();
    expect(componentSizeKey({ name: "AsyncComponentWrapper" })).toBeUndefined();
    expect(componentSizeKey({ name: "JsonCellEditor" })).toBe(
      "component:JsonCellEditor",
    );
  });
});

describe("a drawer's heading", () => {
  const headings = () =>
    [...host.querySelectorAll("h2")].map((heading) => heading.textContent);

  it("is its title", async () => {
    await mountDrawer({ direction: "right" });
    expect(headings()).toEqual(["Order"]);
  });

  it("is the header component's alone when it draws one", async () => {
    const RowHeader = defineComponent({
      props: { heading: String },
      setup: (props) => () => h("h2", props.heading),
    });
    await mountDrawer({
      direction: "right",
      headerComponent: RowHeader,
      headerComponentOptions: { heading: "Order" },
    });
    expect(headings()).toEqual(["Order"]);
  });
});

describe("a drawer's body", () => {
  it("is a flex column a growing body component and its footer fill", async () => {
    const { default: ContainerFooter } = await import(
      "../layers/dms-ui/app/components/container-footer/ContainerFooter.vue"
    );
    await mountDrawer({
      direction: "right",
      component: () =>
        h("div", { class: "flex flex-1 flex-col", "data-body": "" }, [
          h(ContainerFooter, { justify: "between" }, () => h("button")),
        ]),
    });
    await nextTick();
    expect(rendered.ui?.body).toContain("flex");
    expect(rendered.ui?.body).toContain("flex-col");
    const wrapper = host.querySelector("[data-body]")!.parentElement!;
    expect(wrapper.className).toContain("flex-1");
    expect(wrapper.className).toContain("flex-col");
    const footer = host.querySelector("footer")!;
    expect(footer.className).toContain("mt-auto");
    expect(footer.className).toContain("sticky");
    expect(footer.className).toContain("justify-between");
  });
});

describe("a drawer opened through useDrawer, and its caller's provides", () => {
  const EXPLORER_KEY: InjectionKey<string> = Symbol("explorer");

  async function injectedByBody(
    wrap: (options: DrawerOptions) => DrawerOptions,
  ) {
    const { default: DynamicDrawer } = await import(
      "../layers/dms-ui/app/build/components/containers/drawer/DynamicDrawer.vue"
    );
    const { DMS_CONTAINER_KEY } = await import(
      "../layers/dms-ui/app/build/composables/containers/context"
    );
    const { formFieldInjectionKey } = await import(
      "@nuxt/ui/runtime/composables/useFormField.js"
    );
    const opened = shallowRef<DrawerProps>();
    vi.stubGlobal("markRaw", <T>(value: T) => value);
    vi.stubGlobal("useOverlay", () => ({
      create: (_component: Component, { props }: { props: DrawerProps }) => {
        opened.value = props;
        return {
          open: () => new Promise(() => {}),
          close: vi.fn(),
          patch: vi.fn(),
        };
      },
    }));
    const { useDrawer } = await import(
      "../layers/dms-ui/app/composables/containers/useDrawer"
    );
    const injected: BodyInjections = {};
    const Body: Component = {
      setup() {
        injected.explorer = inject(EXPLORER_KEY, null);
        injected.containerId = inject<{ id: string } | null>(
          DMS_CONTAINER_KEY,
          null,
        )?.id;
        injected.formField = inject(formFieldInjectionKey, null);
        return () => null;
      },
    };
    const Caller: Component = {
      setup() {
        const drawer = useDrawer();
        provide(EXPLORER_KEY, "library-1");
        provide(DMS_CONTAINER_KEY, { id: "outer", close: () => {} });
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This deliberately malformed outer form field must never reach the drawer body; it is not a computed Nuxt form-field context.
        provide(formFieldInjectionKey, { name: "outer-field" } as never);
        drawer.open(
          wrap({
            title: "Details",
            component: Body,
            containerId: "inner",
          }),
        );
        return () => null;
      },
    };

    const Host: Component = {
      setup: () => () => (opened.value ? h(DynamicDrawer, opened.value) : null),
    };
    app?.unmount();
    host.replaceChildren();
    const Root: Component = { setup: () => () => [h(Caller), h(Host)] };
    app = createApp(Root);
    app.component("UDrawer", DrawerStub);
    app.component("UContainer", PassThrough);
    app.component("UButton", () => h("button"));
    app.component("USkeleton", () => h("span"));
    app.mount(host);
    await nextTick();
    await nextTick();
    return injected;
  }

  it("lets a module's body inject what the caller provides, the drawer's own container first", async () => {
    expect(await injectedByBody((options) => options)).toEqual({
      explorer: "library-1",
      containerId: "inner",

      formField: undefined,
    });
  });

  it("keeps the DMS's own drawers on the app's provides", async () => {
    const { dmsOwnDrawer } = await import(
      "../layers/dms-ui/app/build/composables/containers/context"
    );
    expect(await injectedByBody(dmsOwnDrawer)).toEqual({
      explorer: null,
      containerId: "inner",
      formField: null,
    });
  });
});

const PassThrough = defineComponent({
  setup:
    (_props, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

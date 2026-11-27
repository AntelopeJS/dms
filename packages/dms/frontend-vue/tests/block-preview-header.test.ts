// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  provide,
  ref,
  useTemplateRef,
  watch,
  type App,
  type FunctionalComponent,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreviewPageHeader from "../layers/dms-layout/app/entries/components/layout/PreviewPageHeader";
import PreviewTopBar from "../layers/dms-layout/app/entries/components/layout/PreviewTopBar";
import {
  previewHeader,
  previewNavigation,
} from "../layers/dms-ui/app/entries/composables/block-preview/previewNavigation";
import {
  PREVIEW_CHANNEL,
  type PreviewBlockTypes,
  type PreviewHeader,
  type PreviewInspectMessage,
  type PreviewOutboundMessage,
  type PreviewRenderMessage,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { stubDmsState } from "./helpers/dms-state-stub";

const sidebarState = new Map<string, Ref<unknown>>();

const BLOCK_TYPES: PreviewBlockTypes = {
  Probe: { componentName: "dms-probe" },
};

const HEADER: PreviewHeader = {
  title: "Orders",
  icon: "i-ph-shopping-cart",
  description: "Everything customers bought",
  actions: [
    { label: "New order", icon: "i-ph-plus", color: "primary" },
    { label: "Export" },
    { label: "Archive", color: "error", variant: "ghost" },
  ],
};

const parentWindow = {
  postMessage: vi.fn<(message: PreviewOutboundMessage) => void>(),
};
let app: App | undefined;
let host: HTMLElement;

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const Probe: FunctionalComponent = () =>
  h("button", { class: "probe", "data-probe": "" }, "Revenue");

const UIcon: FunctionalComponent<{ name?: string }> = (props) =>
  h("i", { "data-icon": props.name });
UIcon.props = ["name"];

const UButton: FunctionalComponent<{
  label?: string;
  icon?: string;
  color?: string;
  variant?: string;
}> = (props, { attrs }) =>
  h(
    "button",
    {
      ...attrs,
      type: "button",
      "data-color": props.color,
      "data-variant": props.variant,
      "data-icon": props.icon,
    },
    props.label,
  );
UButton.props = ["label", "icon", "color", "variant"];

const UDashboardNavbar = defineComponent({
  render() {
    return h("header", [
      this.$slots.leading?.(),
      this.$slots.title?.(),
      this.$slots.right?.(),
    ]);
  },
});

const UBreadcrumb: FunctionalComponent<{
  items?: Array<{ label?: string }>;
}> = (props) =>
  h(
    "nav",
    (props.items ?? []).map((item) => h("span", item.label ?? "home")),
  );
UBreadcrumb.props = ["items"];

function stubRuntime(): void {
  for (const [name, value] of Object.entries({
    computed,
    onMounted,
    provide,
    ref,
    useTemplateRef,
    watch,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("useI18n", () => ({
    t: String,
    locale: ref("en"),
    locales: ref([]),
    setLocale: vi.fn(),
  }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("resolveDmsComponent", (name: string) =>
    name === "DmsPreviewPageHeader"
      ? PreviewPageHeader
      : name === "dms-probe"
        ? Probe
        : undefined,
  );
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  stubDmsState(sidebarState);
  vi.stubGlobal("useDmsCookie", () => ref(false));
  vi.stubGlobal("useDmsAppConfig", () => ({
    ui: { icons: { panelOpen: "i-panel-open", panelClose: "i-panel-close" } },
  }));
}

function install(target: App): void {
  target.component("UIcon", UIcon);
  target.component("UButton", UButton);
  target.component("UDashboardNavbar", UDashboardNavbar);
  target.component("UBreadcrumb", UBreadcrumb);
}

type FromParent =
  | Omit<PreviewRenderMessage, "channel">
  | Omit<PreviewInspectMessage, "channel">;

function postFromParent(data: FromParent): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { channel: PREVIEW_CHANNEL, ...data },
      source: window.parent,
    }),
  );
}

const posted = (type: PreviewOutboundMessage["type"]) =>
  parentWindow.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === type);

function click(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

async function mountPreview(header?: PreviewHeader): Promise<void> {
  const { default: BlockPreview } = await import(
    "../layers/dms-ui/app/components/block-preview/BlockPreview.vue"
  );
  const { default: RecursiveComponent } = await import(
    "../layers/dms-ui/app/components/RecursiveComponent.vue"
  );
  app = createApp(BlockPreview, { embed: true, blockTypes: BLOCK_TYPES });
  app.component("DmsRecursiveComponent", RecursiveComponent);
  install(app);
  app.mount(host);
  postFromParent({
    type: "render",
    tree: [{ type: "Probe" }],
    ...(header && { header }),
  });
  await nextTick();
  await nextTick();
}

beforeEach(() => {
  useRealDataEngine();
  stubRuntime();
  Object.defineProperty(window, "parent", {
    value: parentWindow,
    configurable: true,
  });
  parentWindow.postMessage.mockClear();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  previewHeader.value = undefined;
  previewNavigation.value = undefined;
  sidebarState.clear();
  Object.defineProperty(window, "parent", {
    value: window,
    configurable: true,
  });
  vi.unstubAllGlobals();
});

describe("the page header a mockup draws", () => {
  it("is the dashboard's page header, above the blocks, drawn from the fields the render carries (fails when the header is left out of the preview)", async () => {
    await mountPreview(HEADER);
    const header = host.querySelector("[data-dms-preview-header]");
    expect(header?.tagName).toBe("SECTION");
    expect(header?.querySelector("h1")?.textContent?.trim()).toBe("Orders");
    expect(header?.querySelector("p")?.textContent?.trim()).toBe(
      "Everything customers bought",
    );
    expect(
      header?.querySelector("[data-icon=i-ph-shopping-cart]"),
    ).not.toBeNull();
    const probe = host.querySelector("[data-probe]");
    if (!header || !probe)
      throw new Error("the preview drew no header or block");
    expect(
      header.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws the buttons as the dashboard's header bar looks them: outline while neutral, solid in any other color, as asked when a variant is", async () => {
    await mountPreview(HEADER);
    const buttons = [
      ...host.querySelectorAll("[data-dms-preview-header] button"),
    ];
    expect(
      buttons.map((button) => [
        button.textContent,
        button.getAttribute("data-color"),
        button.getAttribute("data-variant"),
      ]),
    ).toEqual([
      ["New order", "primary", "solid"],
      ["Export", "neutral", "outline"],
      ["Archive", "error", "ghost"],
    ]);
  });

  it("falls back on the dashboard's default icon and draws no button row when the page declares none", async () => {
    await mountPreview({ title: "Orders" });
    const header = host.querySelector("[data-dms-preview-header]");
    expect(header?.querySelector("[data-icon=i-ph-file]")).not.toBeNull();
    expect(header?.querySelectorAll("button")).toHaveLength(0);
    expect(header?.querySelector("p")).toBeNull();
  });

  it("is absent from a preview whose render carries none, as every docs preview is", async () => {
    await mountPreview();
    expect(host.querySelector("[data-dms-preview-header]")).toBeNull();
  });

  it("picks the page, not a block, when it is clicked while inspecting (fails when the click is swallowed or selects a block)", async () => {
    await mountPreview(HEADER);
    postFromParent({ type: "inspect", enabled: true });
    await nextTick();

    const title = host.querySelector("[data-dms-preview-header] h1");
    if (!title) throw new Error("no title");
    click(title);
    expect(posted("select-page")).toHaveLength(1);
    expect(posted("select")).toEqual([]);

    const probe = host.querySelector("[data-probe]");
    if (!probe) throw new Error("no probe");
    click(probe);
    expect(posted("select")).toHaveLength(1);
    expect(posted("select-page")).toHaveLength(1);
  });

  it("picks the page when the empty space around its blocks is clicked while inspecting, which is how the frame's click deselects a block (fails when only a click on the header reaches the viewer)", async () => {
    await mountPreview(HEADER);
    postFromParent({ type: "inspect", enabled: true });
    await nextTick();

    click(host);

    expect(posted("select-page")).toHaveLength(1);
    expect(posted("select")).toEqual([]);
  });

  it("is outlined under the pointer while inspecting, as a block is", async () => {
    await mountPreview(HEADER);
    postFromParent({ type: "inspect", enabled: true });
    await nextTick();
    const title = host.querySelector("[data-dms-preview-header] h1");
    if (!title) throw new Error("no title");
    title.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(
      host
        .querySelector("[data-dms-preview-header]")
        ?.hasAttribute("data-dms-inspect-target"),
    ).toBe(true);
  });
});

describe("the top bar a mockup draws", () => {
  async function mountTopBar(): Promise<void> {
    app = createApp(PreviewTopBar, { title: "Orders" });
    install(app);
    app.mount(host);
    await nextTick();
  }

  it("copies the dashboard's navbar and shows the page in its breadcrumb", async () => {
    await mountTopBar();
    expect(host.querySelector("header")).not.toBeNull();
    expect(host.textContent).toContain("Orders");
  });

  it("leaves everything to the eye but the buttons the sidebar needs: out of the reader's way, out of the pointer's, out of the tab order (fails when a copied button acts)", async () => {
    await mountTopBar();
    const live = [...host.querySelectorAll("button")].filter(
      (button) =>
        button.closest("[aria-hidden=true]") === null &&
        !button.classList.contains("pointer-events-none"),
    );
    expect(live.map((button) => button.getAttribute("aria-label"))).toEqual([
      "header.open_sidebar",
      "header.collapse_sidebar",
    ]);
    for (const button of live) {
      expect(button.hasAttribute("data-dms-preview-navigation")).toBe(true);
    }
    const inert = [...host.querySelectorAll("button")].filter(
      (button) => !live.includes(button),
    );
    expect(inert.length).toBeGreaterThan(3);
    for (const button of inert) {
      const wrapper = button.closest("[aria-hidden=true]") ?? button;
      expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("folds the mockup's sidebar to its rail and back, as the dashboard's header does (fails when the sidebar cannot be folded or unfolded from a mockup)", async () => {
    await mountTopBar();
    const toggle = () =>
      host.querySelector<HTMLButtonElement>(
        'button[aria-label$="_sidebar"]:not([aria-label="header.open_sidebar"])',
      );

    toggle()?.click();
    await nextTick();
    expect(sidebarState.get("dms-sidebar-collapsed")?.value).toBe(true);
    expect(toggle()?.getAttribute("aria-label")).toBe("header.expand_sidebar");

    toggle()?.click();
    await nextTick();
    expect(sidebarState.get("dms-sidebar-collapsed")?.value).toBe(false);
  });
});

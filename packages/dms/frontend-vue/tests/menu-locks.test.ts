/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
  type App,
  type Ref,
  type VNode,
} from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_STATUS_TEXT_CLASSES } from "#dms-core/app/utils/menu";
import NavigationMenu from "../layers/dms-layout/app/components/navigation/NavigationMenu.vue";
import CollapsedMenuItem from "../layers/dms-layout/app/components/navigation/CollapsedMenuItem.vue";
import { useMenuLocks } from "../layers/dms-layout/app/composables/useMenuLocks";
import { browserRuntime } from "./helpers/api-data-runtime";

const DIAGRAM = "database.diagram";
const REASON = "Not available on an external database";

let state: Map<string, Ref<unknown>>;
let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  state = new Map();
  Object.entries({ computed, ref, watch }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useDmsState", <T>(key: string, initial: () => T) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) =>
      value.startsWith("$") ? `translated:${value.slice(1)}` : value,
  }));
  vi.stubGlobal("MENU_STATUS_TEXT_CLASSES", MENU_STATUS_TEXT_CLASSES);
  state.set("dms-permission-preview-session", ref(null));
  state.set("dms-permission-preview-result", ref(null));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

const ITEMS = [
  {
    label: "Diagram",
    fullId: DIAGRAM,
    to: "/modules/database/diagram",
    badge: "2",
  },
  { label: "Tables", fullId: "database.tables", to: "/modules/database" },
] satisfies NavigationMenuItem[];

const renderMenuItem = (item: NavigationMenuItem): VNode =>
  h("div", {
    "data-entry": item.fullId,
    "data-to": item.to,
    "data-badge": item.badge?.label,
    "data-trailing-icon": item.trailingIcon,
    title: item.title,
    class: item.class,
    "aria-disabled": item["aria-disabled"],
  });

const MenuStub = defineComponent(
  (props: { items: NavigationMenuItem[][] }) => () =>
    h("nav", props.items.flat().map(renderMenuItem)),
  { props: ["items"] },
);

function mountMenu(): void {
  app = createApp(NavigationMenu, { items: ITEMS });
  app.component("UNavigationMenu", MenuStub);
  app.mount(host);
}

const entry = (fullId: string) =>
  host.querySelector<HTMLElement>(`[data-entry="${fullId}"]`)!;

describe("useMenuLocks in the sidebar menu", () => {
  it("draws a locked entry muted, with a lock, its reason as tooltip, and no link", async () => {
    mountMenu();
    useMenuLocks().lock({ fullId: DIAGRAM, reason: REASON });
    await nextTick();

    const locked = entry(DIAGRAM);
    expect(locked.title).toBe(REASON);
    expect(locked.dataset.to).toBeUndefined();
    expect(locked.dataset.badge).toBeUndefined();
    expect(locked.dataset.trailingIcon).toBe("i-ph-lock-simple");
    expect(locked.className).toContain("text-muted");
    expect(locked.getAttribute("aria-disabled")).toBe("true");
    expect(entry("database.tables").dataset.to).toBe("/modules/database");
  });

  it("gives the entry its link back on unlock", async () => {
    mountMenu();
    const { lock, unlock } = useMenuLocks();
    lock({ fullId: DIAGRAM, reason: REASON });
    await nextTick();
    unlock(DIAGRAM);
    await nextTick();

    const unlocked = entry(DIAGRAM);
    expect(unlocked.dataset.to).toBe("/modules/database/diagram");
    expect(unlocked.title).toBe("");
    expect(unlocked.dataset.badge).toBe("2");
  });

  it("translates a $-prefixed reason", async () => {
    mountMenu();
    useMenuLocks().lock({ fullId: DIAGRAM, reason: "$database.locked" });
    await nextTick();

    expect(entry(DIAGRAM).title).toBe("translated:database.locked");
  });

  it("keeps one lock per entry, with the last reason given", () => {
    const { locks, lock, unlock } = useMenuLocks();
    lock({ fullId: DIAGRAM, reason: "first" });
    lock({ fullId: DIAGRAM, reason: REASON });
    lock({ fullId: DIAGRAM, reason: REASON });
    unlock("database.unknown");

    expect(locks.value).toEqual([{ fullId: DIAGRAM, reason: REASON }]);
  });
});

describe("a locked entry in the collapsed rail", () => {
  it("renders no link, and names the reason in its tooltip", async () => {
    useMenuLocks().lock({ fullId: DIAGRAM, reason: REASON });
    app = createApp(NavigationMenu, { items: ITEMS, collapsed: true });
    browserRuntime(app);
    app.component("DmsCollapsedMenuItem", CollapsedMenuItem);
    app.component(
      "UTooltip",
      defineComponent({
        props: { text: { type: String, default: "" } },
        setup:
          (props, { slots }) =>
          () =>
            h("span", { "data-tooltip": props.text }, slots.default?.()),
      }),
    );
    app.component(
      "UIcon",
      defineComponent({
        props: { name: { type: String, default: "" } },
        setup: (props) => () => h("i", { "data-icon": props.name }),
      }),
    );
    app.mount(host);
    await nextTick();

    const [diagram, tables] =
      host.querySelectorAll<HTMLElement>("[data-tooltip]");
    expect(diagram?.dataset.tooltip).toBe(`Diagram · ${REASON}`);
    expect(diagram?.querySelector("a")).toBeNull();
    expect(
      diagram?.querySelector('[data-icon="i-ph-lock-simple"]'),
    ).not.toBeNull();
    expect(tables?.dataset.tooltip).toBe("Tables");
    expect(tables?.querySelector("a")).not.toBeNull();
  });
});

/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppWidgetsDock from "../layers/dms-layout/app/components/AppWidgetsDock.vue";
import {
  type AppWidget,
  selectAppWidget,
  useAppWidgets,
} from "../layers/dms-layout/app/composables/useAppWidgets";

const SELECT_KEY = "demo:widget-selected";

let sharedState: Map<string, Ref<unknown>>;
let app: App | undefined;

function useDmsState(key: string, init?: () => unknown): Ref<unknown> {
  const existing = sharedState.get(key);
  if (existing) return existing;
  const created = ref(init?.());
  sharedState.set(key, created);
  return created;
}

const WidgetBody = defineComponent({
  setup: () => () => h("p", { "data-widget-body": "" }, "Status"),
});

function translate(key: string, params?: { label?: string }): string {
  return params?.label === undefined ? key : `${key}(${params.label})`;
}

beforeEach(() => {
  sharedState = new Map();
  const runtime = {
    computed,
    useAppWidgets,
    selectAppWidget,
    useDmsState,
    useI18n: () => ({ t: translate }),
    useTranslation: () => ({ processI18n: (value: string) => value }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function mountDock(widgets: AppWidget[]): Promise<HTMLElement> {
  const { register } = useAppWidgets();
  widgets.forEach(register);
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp(AppWidgetsDock);
  app.component("UIcon", () => h("i"));
  app.component("WidgetBody", WidgetBody);
  app.mount(host);
  await nextTick();
  return host;
}

function widget(extra: Partial<AppWidget> = {}): AppWidget {
  return {
    id: "demo",
    icon: "i-ph-sparkle",
    label: "Assistant",
    body: "WidgetBody",
    ...extra,
  };
}

function chip(host: HTMLElement, label: string): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!found) throw new Error(`no chip labelled ${label}`);
  return found;
}

describe("app widget dock", () => {
  it("counts each click in the state the widget names", async () => {
    const host = await mountDock([widget({ onSelectEvent: SELECT_KEY })]);

    chip(host, "Assistant").click();
    chip(host, "Assistant").click();

    expect(useDmsState(SELECT_KEY).value).toBe(2);
  });

  it("writes no state for a widget without a click action", async () => {
    const host = await mountDock([widget()]);

    chip(host, "Assistant").click();

    expect(sharedState.has(SELECT_KEY)).toBe(false);
  });

  it("keeps the hover card body on a clickable widget", async () => {
    const host = await mountDock([widget({ onSelectEvent: SELECT_KEY })]);

    chip(host, "Assistant").click();
    await nextTick();

    expect(host.querySelectorAll("[data-widget-body]")).toHaveLength(1);
  });

  it("draws the dot and names it in the chip label", async () => {
    const host = await mountDock([widget({ badge: "dot" })]);

    expect(host.querySelectorAll("[data-widget-dot]")).toHaveLength(1);
    expect(
      chip(host, "widgets_dock.attention(Assistant)").getAttribute("title"),
    ).toBe("Assistant");
  });

  it("draws no dot on a widget without a badge", async () => {
    const host = await mountDock([widget()]);

    expect(host.querySelector("[data-widget-dot]")).toBeNull();
  });

  it("carries a folded widget's dot onto the launcher", async () => {
    const host = await mountDock([
      widget({ badge: "dot" }),
      widget({ id: "other", label: "Other" }),
    ]);

    expect(host.querySelectorAll("[data-widget-dot]")).toHaveLength(2);
  });
});

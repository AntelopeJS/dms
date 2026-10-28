/** @vitest-environment jsdom */
/**
 * A TopListCard's period badge across a server render and its hydration,
 * through the runtime's real payload: once its selector set up before it, the
 * server prints the preset whatever it knows of the browser's time zone (a
 * preset reads the same in every zone, and a relative one at every instant),
 * and the browser hydrates it without a mismatch. A selector further down the
 * page leaves a skeleton on both sides, which the label replaces once mounted.
 */
import {
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  ref,
  type App,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeriodPreset } from "../layers/dms-core/app/composables/period/types";
import { browserTimeZone } from "../layers/dms-core/app/utils/regional";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";
import { stubBlockRuntime } from "./helpers/block-runtime";

const engine = await import("#dms/frontend-module");
const { usePeriod } = await import(
  "../layers/dms-core/app/composables/period/usePeriod"
);
const { registerPeriodScope } = await import(
  "../layers/dms-core/app/composables/period/usePeriodScope"
);
const { TIME_ZONE_COOKIE } = await import(
  "../layers/dms-core/app/composables/period/periodTimeZone"
);

const SCOPE = "dashboard";
const SKELETON = "SKELETON";

function selector(preset: PeriodPreset): Component {
  return defineComponent({
    setup() {
      const period = usePeriod({ defaultPreset: preset });
      onBeforeUnmount(registerPeriodScope(SCOPE, period.state));
      return () => h("i");
    },
  });
}

const Slot = defineComponent({
  props: { ariaLabel: String },
  setup:
    (props, { slots }) =>
    () =>
      h("span", props.ariaLabel ? SKELETON : slots.default?.()),
});

const Card = defineComponent({
  setup: () => () =>
    h(TopListCard, {
      title: "Top plans",
      componentId: "plans",
      pageId: "dashboard",
      fetchUrl: "/api/plans/top",
      periodScope: SCOPE,
    }),
});

function page(children: Component[]): App {
  const app = createSSRApp({
    render: () =>
      h(
        "main",
        children.map((child) => h(child)),
      ),
  });
  for (const name of ["DmsCard", "UBadge", "USkeleton", "DmsTopListRow"])
    app.component(name, Slot);
  return app;
}

function zoneCookie(zone: string): string {
  return `${TIME_ZONE_COOKIE}=${encodeURIComponent(JSON.stringify(zone))}`;
}

async function serverRender(children: Component[], cookies?: string) {
  const runtime = engine.createDmsFrontendRuntime(undefined, {}, true, cookies);
  const app = page(children);
  engine.provideDmsFrontendRuntime(app, runtime);
  engine.setDmsServerRuntimeResolver(() => runtime);

  const browserWindow = globalThis.window;
  vi.stubGlobal("window", undefined);
  try {
    const html = await renderToString(app);
    return { html, payload: engine.serializeDmsPayload(runtime) };
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
}

const mounted: App[] = [];

async function hydrate(
  children: Component[],
  { html, payload }: { html: string; payload: unknown },
) {
  const browser = engine.createDmsFrontendRuntime(undefined, {});
  engine.restoreDmsPayload(
    browser,
    structuredClone(payload) as Parameters<typeof engine.restoreDmsPayload>[1],
  );
  const container = document.createElement("div");
  container.innerHTML = html;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const app = page(children);
    engine.provideDmsFrontendRuntime(app, browser);
    app.mount(container);
    mounted.push(app);
    await nextTick();
    const mismatches = [...warn.mock.calls, ...error.mock.calls].filter(
      (call) => /hydration|mismatch/i.test(String(call[0])),
    );
    return { container, mismatches };
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
}

/** The card head's badge: its preset label, or its skeleton. */
function badge(html: string): string {
  const label = /dms\.period\.presets\.[a-z0-9-]+/.exec(html)?.[0];
  if (label) return label;
  return html.includes(SKELETON) ? SKELETON : "none";
}

beforeEach(async () => {
  await stubBlockRuntime(async () => ({
    items: [{ id: "pro", title: "Pro", value: 12 }],
  }));
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
});

describe("a TopListCard's period badge across hydration", () => {
  it("is in the server's HTML, and hydrates without a mismatch", async () => {
    const children = [selector("this-month"), Card];
    const rendered = await serverRender(
      children,
      zoneCookie(browserTimeZone()),
    );
    expect(badge(rendered.html)).toBe("dms.period.presets.this-month");

    const { container, mismatches } = await hydrate(children, rendered);
    expect(mismatches).toEqual([]);
    expect(badge(container.innerHTML)).toBe("dms.period.presets.this-month");
  });

  it("is rendered before the browser's time zone is known", async () => {
    const children = [selector("this-month"), Card];
    const rendered = await serverRender(children);
    expect(badge(rendered.html)).toBe("dms.period.presets.this-month");

    const { mismatches } = await hydrate(children, rendered);
    expect(mismatches).toEqual([]);
  });

  it("names a relative preset too", async () => {
    const children = [selector("last-24h"), Card];
    const rendered = await serverRender(
      children,
      zoneCookie(browserTimeZone()),
    );
    expect(badge(rendered.html)).toBe("dms.period.presets.last-24h");

    const { mismatches } = await hydrate(children, rendered);
    expect(mismatches).toEqual([]);
  });

  it("waits for a selector set up after the card, on both sides", async () => {
    const children = [Card, selector("last-year")];
    const rendered = await serverRender(
      children,
      zoneCookie(browserTimeZone()),
    );
    expect(badge(rendered.html)).toBe(SKELETON);

    const { container, mismatches } = await hydrate(children, rendered);
    expect(mismatches).toEqual([]);
    await nextTick();
    expect(badge(container.innerHTML)).toBe("dms.period.presets.last-year");
  });
});

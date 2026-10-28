/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import uiEn from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import uiFr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";
import { providePageHeaderActions } from "../layers/dms-layout/app/composables/layout/usePageHeaderActions";

type Messages = typeof uiEn | typeof uiFr;

const translator = (messages: Messages) => (key: string) =>
  String(
    key.split(".").reduce<unknown>(
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- A dotted translation path walks nested JSON nodes before reaching a string. Inference and the concrete locale owners cannot index arbitrary path segments; this preserves the existing optional lookup without prevalidating it.
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    ) ?? key,
  );

const IconStub = defineComponent({
  props: { name: String },
  setup: (props) => () => h("i", { "data-icon": props.name }),
});

let app: App | undefined;
let host: HTMLDivElement;

async function mount(component: Parameters<typeof createApp>[0]) {
  app = createApp(component);
  app.component("UIcon", IconStub);
  app.mount(host);
  for (let tick = 0; tick < 3; tick++) await nextTick();
}

const badge = () =>
  host.querySelector<HTMLElement>("[data-instant-save-badge]");

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: translator(uiEn) }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("DmsInstantSaveBadge", () => {
  it("says what the save state is, in en-GB", async () => {
    const { default: InstantSaveBadge } = await import(
      "../layers/dms-ui/app/components/save-bar/InstantSaveBadge.vue"
    );
    const labels = [
      [undefined, "Saved instantly"],
      ["idle", "Saved instantly"],
      ["saving", "Saving"],
      ["saved", "Saved instantly"],
      ["error", "Not saved"],
    ] as const;
    for (const [state, label] of labels) {
      await mount({ render: () => h(InstantSaveBadge, { state }) });
      expect(badge()?.textContent?.trim()).toBe(label);
      expect(badge()?.dataset.state).toBe(state ?? "idle");
      expect(badge()?.title).toBeTruthy();
      app?.unmount();
      app = undefined;
    }
  });

  it("flashes through its icon only: bolt, spinner, tick", async () => {
    const { default: InstantSaveBadge } = await import(
      "../layers/dms-ui/app/components/save-bar/InstantSaveBadge.vue"
    );
    const icons = {
      idle: "i-ph-lightning",
      saving: "i-ph-circle-notch",
      saved: "i-ph-check",
    };
    for (const [state, icon] of Object.entries(icons)) {
      await mount({ render: () => h(InstantSaveBadge, { state }) });
      expect(badge()?.querySelector("i")?.dataset.icon).toBe(icon);
      app?.unmount();
      app = undefined;
    }
  });

  it("is translated in French", async () => {
    vi.stubGlobal("useI18n", () => ({ t: translator(uiFr) }));
    const { default: InstantSaveBadge } = await import(
      "../layers/dms-ui/app/components/save-bar/InstantSaveBadge.vue"
    );
    await mount({ render: () => h(InstantSaveBadge) });
    expect(badge()?.textContent?.trim()).toBe("Enregistré instantanément");
  });
});

describe("useInstantSaveHeader", () => {
  it("puts the badge in the page header actions of the layout", async () => {
    const { useInstantSaveHeader } = await import(
      "../layers/dms-layout/app/composables/layout/useInstantSaveHeader"
    );
    let actions: ReturnType<typeof providePageHeaderActions> | undefined;
    const Page = defineComponent({
      setup() {
        useInstantSaveHeader(() => "saved");
        return () => h("main");
      },
    });
    const Layout = defineComponent({
      setup() {
        actions = providePageHeaderActions();
        return () =>
          h("div", [h("header", actions?.actions.value?.()), h(Page)]);
      },
    });
    await mount(Layout);
    expect(host.querySelector("header [data-instant-save-badge]")).not.toBe(
      null,
    );
    expect(badge()?.textContent?.trim()).toBe("Saved instantly");
    expect(badge()?.dataset.state).toBe("saved");
  });

  it("folds per-control states: saving wins, then saved, else idle", async () => {
    const { combineSaveStates } = await import(
      "../layers/dms-layout/app/composables/layout/useInstantSaveHeader"
    );
    expect(combineSaveStates([])).toBe("idle");
    expect(combineSaveStates(["idle", undefined])).toBe("idle");
    expect(combineSaveStates(["idle", "saved"])).toBe("saved");
    expect(combineSaveStates(["saved", "saving", "idle"])).toBe("saving");
  });
});

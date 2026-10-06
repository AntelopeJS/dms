// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import uiEn from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import uiFr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";
import { providePageHeaderActions } from "../layers/dms-layout/app/composables/layout/usePageHeaderActions";

type Messages = Record<string, unknown>;

const translator = (messages: Messages) => (key: string) =>
  String(
    key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Messages | undefined)?.[part],
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
  it("reads exactly 'Saved instantly' in en-GB, whatever the save state", async () => {
    const { default: InstantSaveBadge } = await import(
      "../layers/dms-ui/app/components/save-bar/InstantSaveBadge.vue"
    );
    for (const state of [undefined, "idle", "saving", "saved"] as const) {
      await mount({ render: () => h(InstantSaveBadge, { state }) });
      expect(badge()?.textContent?.trim()).toBe("Saved instantly");
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
    const icons: Record<string, string> = {
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

  it("uses one key, translated in French", async () => {
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

describe("instant-save page registry", () => {
  const root = resolve(__dirname, "../layers");
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const SETTINGS = "dms-layout/app/custom-pages/settings";
  const SETTINGS_PARTS = "dms-layout/app/build/components/pages/settings";

  /** Pages (or the section owning them) whose controls save on their own. */
  /** The generic form: the pill with `saveMode: "instant"`, a bar otherwise. */
  const FORM = "dms-ui/app/components/form/Form.vue";
  const INSTANT_SAVE = [
    `${SETTINGS}/appearance.vue`,
    `${SETTINGS}/region.vue`,
    `${SETTINGS_PARTS}/notification/NotificationPreferencesForm.vue`,
    FORM,
  ];
  /** Save bar, explicit actions, or nothing persisted: no pill. */
  const NO_PILL = [
    `${SETTINGS}/roles.vue`,
    `${SETTINGS}/shortcuts.vue`,
    `${SETTINGS}/index.vue`,
    `${SETTINGS_PARTS}/profile/ProfilePersonalInfo.vue`,
    `${SETTINGS_PARTS}/roles/RoleEditor.vue`,
  ];

  const vueFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return vueFiles(path);
      return entry.name.endsWith(".vue") ? [path] : [];
    });

  it("shows the shared pill on every instant-save page", () => {
    for (const path of INSTANT_SAVE) {
      expect(read(path), path).toMatch(/useInstantSaveHeader\(/);
    }
  });

  it("keeps it off pages with a save bar or explicit actions", () => {
    for (const path of NO_PILL) {
      expect(read(path), path).not.toMatch(/useInstantSaveHeader/);
    }
  });

  it("is the only instant-save pill: no page draws its own, none sits by a save bar", () => {
    const users = vueFiles(root)
      .map((path) => ({
        path: relative(root, path).replaceAll("\\", "/"),
        source: readFileSync(path, "utf8"),
      }))
      .filter(({ source }) => source.includes("useInstantSaveHeader"));
    expect(users.map(({ path }) => path).sort()).toEqual(
      [...INSTANT_SAVE].sort(),
    );
    for (const { path, source } of users) {
      if (path === FORM) continue;
      expect(source, path).not.toMatch(/DmsSaveBar|saveBar/);
    }
    expect(read(FORM)).toMatch(/if \(instantSave && /);
    for (const path of vueFiles(root)) {
      const source = readFileSync(path, "utf8");
      if (!source.includes("usePageHeaderActions(")) continue;
      expect(source, path).not.toMatch(/bg-success\/10|\.instant"\)/);
    }
  });
});

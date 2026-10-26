// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installShellRuntime } from "./helpers/live-shell-runtime";
import { engine } from "./helpers/api-data-runtime";

describe("the shortcuts plugin", () => {
  let app: App | undefined;
  let disposeRuntime: (() => void) | undefined;

  afterEach(() => {
    app?.unmount();
    disposeRuntime?.();
    vi.unstubAllGlobals();
  });

  it("lists the aggregate's shortcuts on the public settings page without duplicates", async () => {
    disposeRuntime = await installShellRuntime("/settings/shortcuts");
    vi.stubGlobal("defineShortcuts", () => undefined);
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => key,
      te: () => false,
    }));
    const { default: setup } = await import(
      "../layers/dms-ui/app/plugins/shortcuts"
    );
    const { default: Shortcuts } = await import(
      "../layers/dms-layout/app/custom-pages/settings/shortcuts.vue"
    );
    await setup(engine.useDmsApp());
    app = createApp(Shortcuts);
    app.component(
      "DmsSection",
      defineComponent({
        props: ["title"],
        setup:
          (props, { slots }) =>
          () =>
            h("section", [
              h("h2", props.title),
              slots.badge?.(),
              slots.default?.(),
            ]),
      }),
    );
    app.component(
      "DmsFieldRow",
      defineComponent({
        props: ["label"],
        setup:
          (props, { slots }) =>
          () =>
            h("article", [props.label, slots.default?.()]),
      }),
    );
    app.component("UInput", { render: () => h("input") });
    app.component(
      "UKbd",
      defineComponent({
        props: ["value"],
        setup: (props) => () => h("kbd", props.value),
      }),
    );
    app.component("UIcon", { render: () => null });
    const host = document.createElement("div");
    app.mount(host);
    expect(
      [...host.querySelectorAll("h2")].map((group) => group.textContent),
    ).toEqual(["GLOBAL", "TAB", "TABLEVIEW", "LIVETOGGLE", "FINDER"]);
    const finder = [...host.querySelectorAll("section")].at(-1)!;
    expect(finder.querySelectorAll("article")).toHaveLength(1);
    expect(finder.querySelector("article")?.textContent).toContain(
      "finder.open",
    );
    expect(
      [...finder.querySelectorAll("kbd")].map((key) => key.textContent),
    ).toEqual(["ENTER"]);
    expect(
      [...host.querySelectorAll("section")].every(
        (group) => group.querySelectorAll("article").length > 0,
      ),
    ).toBe(true);
    const before = host.innerHTML;
    await setup(engine.useDmsApp());
    await nextTick();
    expect(host.innerHTML).toBe(before);
  });
});

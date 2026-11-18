/** @vitest-environment jsdom */
/**
 * The Simple mode's accent row: a Custom swatch after the presets opens a
 * picker, each color picked previews at once, Save writes the brand palette,
 * a saved one opens as the selected Custom swatch, and a preset takes it back.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { App, Component, FunctionalComponent } from "vue";
import { h } from "vue";
import {
  buttonNamed,
  changeCountText,
  installBrandingRuntime,
  mountEditor,
  settle,
  type BrandingAnswer,
  type BrandingCall,
} from "./helpers/branding-editor";
import type { JsonValue } from "../layers/dms-core/app/types/json";
import { isFunction } from "../layers/dms-core/app/utils/type-check";

function files(
  version: string,
  held: {
    colors?: Record<string, string>;
    shared?: Record<string, string>;
  } = {},
) {
  return {
    layer: { name: "project", sourcePath: "/project/frontend-vue" },
    variables: { shared: held.shared ?? {}, light: {}, dark: {} },
    colors: held.colors ?? {},
    logos: {},
    version,
  };
}

const ok = (data: JsonValue): BrandingAnswer => ({ ok: true, data });

/** The popover shows its content at once, and the color area is a color input. */
const PopoverStub: FunctionalComponent = (_, { slots }) =>
  h("div", [slots.default?.(), slots.content?.()]);

const ColorAreaStub: FunctionalComponent = (_, { attrs }) =>
  h("input", {
    type: "color",
    "data-color-area": "",
    value: String(attrs["model-value"]),
    onInput: (event: Event) => {
      const update = attrs["onUpdate:modelValue"];
      if (isFunction(update) && event.target instanceof HTMLInputElement) {
        update(event.target.value.toUpperCase());
      }
    },
  });

const HexInputStub: FunctionalComponent = (_, { attrs }) => {
  const { "model-value": modelValue, ...rest } = attrs;
  return h("input", {
    ...rest,
    value: String(modelValue ?? ""),
    onInput: (event: Event) => {
      const update = attrs["onUpdate:modelValue"];
      if (isFunction(update) && event.target instanceof HTMLInputElement) {
        update(event.target.value);
      }
    },
  });
};

const STUBS = {
  UPopover: PopoverStub,
  UColorPicker: ColorAreaStub,
  UInput: HexInputStub,
} satisfies Record<string, Component>;

let app: App | undefined;

async function openEditor(answer: (call: BrandingCall) => BrandingAnswer) {
  const runtime = installBrandingRuntime(answer);
  const { default: BrandingEditor } = await import(
    "../layers/dms-layout/app/entries/branding/BrandingEditor"
  );
  const mounted = await mountEditor(BrandingEditor, { stubs: STUBS });
  app = mounted.app;
  return { ...runtime, host: mounted.host };
}

const customSwatch = (host: HTMLElement) => buttonNamed(host, "Custom color");

async function type(host: HTMLElement, text: string): Promise<void> {
  const field = host.querySelector("[data-accent-hex]");
  if (!(field instanceof HTMLInputElement)) throw new Error("no hex field");
  field.value = text;
  field.dispatchEvent(new Event("input"));
  await settle();
}

const puts = (calls: BrandingCall[]) =>
  calls.filter((call) => call.method === "PUT");

beforeEach(() => localStorage.clear());

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
});

describe("the Custom swatch", () => {
  it("follows the presets and is not selected on a preset", async () => {
    const { host } = await openEditor(() =>
      ok(files("v1", { colors: { primary: "violet" } })),
    );
    expect(customSwatch(host).getAttribute("aria-pressed")).toBe("false");
    expect(
      buttonNamed(host, "Palette violet").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(changeCountText(host)).toBe("No changes");
  });

  it("is a real button a keyboard reaches", async () => {
    const { host } = await openEditor(() => ok(files("v1")));
    expect(customSwatch(host).tagName).toBe("BUTTON");
    expect(customSwatch(host).getAttribute("type")).toBe("button");
    expect(customSwatch(host).tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("previews each hex typed and becomes the selected swatch, as one change", async () => {
    const { host, calls } = await openEditor(() => ok(files("v1")));
    await type(host, "#3b82f6");
    expect(customSwatch(host).getAttribute("aria-pressed")).toBe("true");
    expect(customSwatch(host).style.background).toContain("rgb(59, 130, 246)");
    expect(changeCountText(host)).toBe("1 change");
    await type(host, "#e11d48");
    expect(changeCountText(host)).toBe("1 change");
    expect(customSwatch(host).style.background).toContain("rgb(225, 29, 72)");
    expect(puts(calls)).toEqual([]);
  });

  it("takes the color picked in the color area as well", async () => {
    const { host } = await openEditor(() => ok(files("v1")));
    const area = host.querySelector("[data-color-area]");
    if (!(area instanceof HTMLInputElement)) throw new Error("no color area");
    area.value = "#16a34a";
    area.dispatchEvent(new Event("input"));
    await settle();
    expect(customSwatch(host).style.background).toContain("rgb(22, 163, 74)");
    expect(
      host.querySelector<HTMLInputElement>("[data-accent-hex]")?.value,
    ).toBe("#16a34a");
  });

  it("refuses a hex that is not a color, and keeps the last good one", async () => {
    const { host } = await openEditor(() => ok(files("v1")));
    await type(host, "#3b82f6");
    await type(host, "#3b82");
    expect(host.querySelector("[role=alert]")?.textContent).toContain(
      "Type a color",
    );
    expect(
      host.querySelector("[data-accent-hex]")?.getAttribute("aria-invalid"),
    ).toBe("true");
    expect(customSwatch(host).style.background).toContain("rgb(59, 130, 246)");
    expect(changeCountText(host)).toBe("1 change");
  });
});

describe("saving a custom accent", () => {
  it("sends the brand palette and points the primary at it", async () => {
    const { host, calls } = await openEditor((call) =>
      call.method === "PUT" ? ok({ version: "v2" }) : ok(files("v1")),
    );
    await type(host, "#3b82f6");
    buttonNamed(host, "Save").click();
    await settle();
    const sent = puts(calls)[0]?.body;
    expect(sent).toMatchObject({
      expectedVersion: "v1",
      draft: { colors: { primary: "brand" } },
    });
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    expect(sent).toMatchObject({
      draft: {
        variables: {
          shared: {
            ...Object.fromEntries(
              shades.map((shade) => [
                `--color-brand-${shade}`,
                expect.stringMatching(/^#[0-9a-f]{6}$/),
              ]),
            ),
            "--color-brand-500": "#3b82f6",
          },
        },
      },
    });
  });

  it("opens a saved custom accent as the selected Custom swatch with its color", async () => {
    const saved = files("v1", {
      colors: { primary: "brand" },
      shared: { "--color-brand-500": "#3b82f6" },
    });
    const { host } = await openEditor(() => ok(saved));
    expect(customSwatch(host).getAttribute("aria-pressed")).toBe("true");
    expect(customSwatch(host).style.background).toContain("rgb(59, 130, 246)");
    expect(
      host.querySelector<HTMLInputElement>("[data-accent-hex]")?.value,
    ).toBe("#3b82f6");
    expect(changeCountText(host)).toBe("No changes");
    for (const swatch of host.querySelectorAll("[data-palette]")) {
      expect(swatch.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("goes back to a preset: the preset is written and the brand shades are dropped", async () => {
    const saved = files("v1", {
      colors: { primary: "brand" },
      shared: { "--color-brand-500": "#3b82f6", "--ui-radius": "0.5rem" },
    });
    const { host, calls } = await openEditor((call) =>
      call.method === "PUT" ? ok({ version: "v2" }) : ok(saved),
    );
    buttonNamed(host, "Palette violet").click();
    await settle();
    expect(changeCountText(host)).toBe("1 change");
    expect(customSwatch(host).getAttribute("aria-pressed")).toBe("false");
    buttonNamed(host, "Save").click();
    await settle();
    expect(puts(calls)[0]?.body).toMatchObject({
      draft: {
        colors: { primary: "violet" },
        variables: { shared: { "--ui-radius": "0.5rem" } },
      },
    });
    expect(JSON.stringify(puts(calls)[0]?.body).includes("--color-brand")).toBe(
      false,
    );
  });
});

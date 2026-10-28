/** @vitest-environment jsdom */
/**
 * A short single-line input sizes itself for its value instead of filling
 * the row: asked for with `width: "compact"`, or by itself when its bounds
 * keep the value short (a number whose `max` fits in 6 digits, a text whose
 * `maxLength` is 16 or less). The width applies from `sm` up, so a phone
 * keeps the full row, and `width: "full"` opts out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  type Component,
  createApp,
  defineComponent,
  h,
  nextTick,
} from "vue";
import {
  isCompactNumberInput,
  isCompactTextInput,
} from "../layers/dms-ui/app/build/utils/inputWidth";
import { isNumber } from "../layers/dms-core/app/utils/type-check";

const COMPACT_CLASS = "sm:max-w-44";

let app: App | undefined;
let host: HTMLDivElement;

const Control = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup:
      (_, { attrs }) =>
      () => {
        const { class: className, ...rest } = attrs;
        return h("div", { "data-control": tag, class: className }, [
          h(tag, rest),
        ]);
      },
  });

async function mount(
  component: Component,
  props: Parameters<typeof createApp>[1],
) {
  app = createApp({
    render: () => h(component, { class: "w-full", ...props }),
  });
  app.component("UInput", Control("input"));
  app.component("UInputNumber", Control("input"));
  app.mount(host);
  await nextTick();
}

const load = async (name: string): Promise<Component> =>
  (await import(`../layers/dms-ui/app/components/form/components/${name}.vue`))
    .default;

const control = () => host.querySelector("[data-control]")!;

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: { value: "en" } }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("isNumber", isNumber);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("isCompactNumberInput", () => {
  it("follows the width asked for", () => {
    expect(isCompactNumberInput({ width: "compact" })).toBe(true);
    expect(isCompactNumberInput({ width: "full", max: 10 })).toBe(false);
  });

  it("is compact by itself when the bounds fit in 6 digits", () => {
    expect(isCompactNumberInput({ min: 0, max: 100 })).toBe(true);
    expect(isCompactNumberInput({ max: 999_999.5 })).toBe(true);
    expect(isCompactNumberInput({ min: -50, max: 50 })).toBe(true);
    expect(isCompactNumberInput({ max: 1_000_000 })).toBe(false);
    expect(isCompactNumberInput({ min: -10_000_000, max: 0 })).toBe(false);
  });

  it("fills the row when nothing bounds the value", () => {
    expect(isCompactNumberInput({})).toBe(false);
    expect(isCompactNumberInput({ min: 0 })).toBe(false);
    expect(isCompactNumberInput({ max: Infinity })).toBe(false);
  });
});

describe("isCompactTextInput", () => {
  it("is compact for a short maxLength or when asked", () => {
    expect(isCompactTextInput({ maxLength: 3 })).toBe(true);
    expect(isCompactTextInput({ maxLength: 16 })).toBe(true);
    expect(isCompactTextInput({ maxLength: 17 })).toBe(false);
    expect(isCompactTextInput({})).toBe(false);
    expect(isCompactTextInput({ width: "compact" })).toBe(true);
    expect(isCompactTextInput({ width: "full", maxLength: 3 })).toBe(false);
  });
});

describe("a number field's width", () => {
  it("is compact when asked, and keeps the row's width below sm", async () => {
    await mount(await load("InputNumber"), {
      modelValue: 3,
      min: 0,
      width: "compact",
    });
    expect(control().classList).toContain(COMPACT_CLASS);
    expect(control().classList).toContain("w-full");
    expect(host.querySelector("input")!.hasAttribute("width")).toBe(false);
  });

  it("is compact beside its unit", async () => {
    await mount(await load("InputNumber"), {
      modelValue: 3,
      width: "compact",
      suffix: "h",
    });
    expect(control().classList).toContain(COMPACT_CLASS);
    expect(control().classList).toContain("flex-1");
  });

  it("is compact by itself for a small max, full otherwise", async () => {
    await mount(await load("InputNumber"), { modelValue: 3, max: 100 });
    expect(control().classList).toContain(COMPACT_CLASS);
    app!.unmount();
    host.replaceChildren();
    await mount(await load("InputNumber"), { modelValue: 3, min: 0 });
    expect(control().classList).not.toContain(COMPACT_CLASS);
  });

  it("is compact for a percentage, unless asked to fill the row", async () => {
    await mount(await load("InputPercentage"), { modelValue: 0.2 });
    expect(host.firstElementChild!.classList).toContain(COMPACT_CLASS);
    app!.unmount();
    host.replaceChildren();
    await mount(await load("InputPercentage"), {
      modelValue: 0.2,
      width: "full",
    });
    expect(host.firstElementChild!.classList).not.toContain(COMPACT_CLASS);
    expect(host.querySelector("input")!.hasAttribute("width")).toBe(false);
  });
});

describe("a text field's width", () => {
  it("is compact for a short maxLength, full otherwise", async () => {
    await mount(await load("InputText"), { modelValue: "EUR", maxLength: 3 });
    expect(control().classList).toContain(COMPACT_CLASS);
    expect(host.querySelector("input")!.hasAttribute("width")).toBe(false);
    app!.unmount();
    host.replaceChildren();
    await mount(await load("InputText"), { modelValue: "Acme", maxLength: 60 });
    expect(control().classList).not.toContain(COMPACT_CLASS);
  });
});

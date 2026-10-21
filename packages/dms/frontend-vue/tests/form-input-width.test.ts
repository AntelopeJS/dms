// @vitest-environment jsdom
/**
 * A short single-line input sizes itself for its value instead of filling
 * the row when its data type asks for it with `width: "compact"`. Nothing
 * else makes it compact: a field's bounds (`max`, `maxLength`) leave
 * existing forms as they were. The width applies from `sm` up, so a phone
 * keeps the full row.
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

const COMPACT_CLASS = "sm:max-w-44";

let app: App | undefined;
let host: HTMLDivElement;

// The Nuxt UI control: its root takes the class, the input the rest.
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

async function mount(component: Component, props: Record<string, unknown>) {
  app = createApp({
    render: () => h(component, { class: "w-full", ...props }),
  });
  app.component("UInput", Control("input"));
  app.component("UInputNumber", Control("input"));
  app.mount(host);
  await nextTick();
}

const load = async (name: string) =>
  (await import(`../layers/dms-ui/app/components/form/components/${name}.vue`))
    .default as Component;

const control = () => host.querySelector("[data-control]")!;

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: { value: "en" } }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("isNumber", (value: unknown) => typeof value === "number");
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
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

  it("stays full however short its bounds", async () => {
    await mount(await load("InputNumber"), { modelValue: 3, max: 100 });
    expect(control().classList).not.toContain(COMPACT_CLASS);
  });

  it("is compact for a percentage only when asked", async () => {
    await mount(await load("InputPercentage"), { modelValue: 0.2 });
    expect(host.firstElementChild!.classList).not.toContain(COMPACT_CLASS);
    app!.unmount();
    host.replaceChildren();
    await mount(await load("InputPercentage"), {
      modelValue: 0.2,
      width: "compact",
    });
    expect(host.firstElementChild!.classList).toContain(COMPACT_CLASS);
    expect(host.querySelector("input")!.hasAttribute("width")).toBe(false);
  });
});

describe("a text field's width", () => {
  it("is compact when asked, never for a short maxLength alone", async () => {
    await mount(await load("InputText"), {
      modelValue: "EUR",
      maxLength: 3,
      width: "compact",
    });
    expect(control().classList).toContain(COMPACT_CLASS);
    expect(host.querySelector("input")!.hasAttribute("width")).toBe(false);
    app!.unmount();
    host.replaceChildren();
    await mount(await load("InputText"), { modelValue: "EUR", maxLength: 3 });
    expect(control().classList).not.toContain(COMPACT_CLASS);
  });
});

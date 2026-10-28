/** @vitest-environment jsdom */
/**
 * A number field writes its unit inside the box, before the stepper ("30
 * days"), so it is as wide as the fields around it; a text field
 * or a text area asked for it counts the characters typed, out of its
 * `maxLength` ("4 / 60"). Without either option, the control is unchanged.
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
import { characterCountText } from "../layers/dms-ui/app/entries/utils/characterCount";

let app: App | undefined;
let host: HTMLDivElement;

let ui: Array<{ base?: unknown } | undefined> = [];

const Control = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    props: { ui: { type: Object, default: undefined } },
    setup:
      (props, { slots, attrs }) =>
      () => {
        ui.push(props.ui);
        return h("div", { "data-control": tag }, [
          h(tag, { ...attrs }),
          slots.trailing?.(),
        ]);
      },
  });

async function mount(
  component: Component,
  props: Parameters<typeof createApp>[1],
) {
  app = createApp({ render: () => h(component, props) });
  app.component("UInput", Control("input"));
  app.component("UTextarea", Control("textarea"));
  app.component("UInputNumber", Control("input"));
  app.mount(host);
  await nextTick();
}

const loaders = {
  InputText: () =>
    import("../layers/dms-ui/app/components/form/components/InputText.vue"),
  Textarea: () =>
    import("../layers/dms-ui/app/components/form/components/Textarea.vue"),
  InputNumber: () =>
    import("../layers/dms-ui/app/components/form/components/InputNumber.vue"),
};
const load = async (name: keyof typeof loaders): Promise<Component> =>
  (await loaders[name]()).default;

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: { value: "en" } }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => (text.startsWith("$") ? `t(${text})` : text),
  }));
  ui = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("characterCountText", () => {
  it("counts out of the limit, or alone", () => {
    expect(characterCountText("Acme", 60)).toBe("4 / 60");
    expect(characterCountText("Acme")).toBe("4");
    expect(characterCountText(undefined, 60)).toBe("0 / 60");
    expect(characterCountText("👋🏽", 10)).toBe("2 / 10");
  });
});

describe("a text field's counter", () => {
  it("shows the count in the field when asked", async () => {
    await mount(await load("InputText"), {
      modelValue: "Acme",
      maxLength: 60,
      showCount: true,
    });
    expect(
      host.querySelector("[data-character-count]")?.textContent?.trim(),
    ).toBe("4 / 60");
    const input = host.querySelector("input")!;
    expect(input.getAttribute("maxlength")).toBe("60");
    expect(input.hasAttribute("showcount")).toBe(false);
  });

  it("draws no counter by default", async () => {
    await mount(await load("InputText"), { modelValue: "Acme", maxLength: 60 });
    expect(host.querySelector("[data-character-count]")).toBeNull();
    expect(host.querySelector("input")!.getAttribute("maxlength")).toBe("60");
  });

  it("counts under a text area", async () => {
    await mount(await load("Textarea"), {
      modelValue: "Hello",
      maxLength: 280,
      showCount: true,
    });
    expect(
      host.querySelector("[data-character-count]")?.textContent?.trim(),
    ).toBe("5 / 280");
    expect(host.querySelector("textarea")!.hasAttribute("showcount")).toBe(
      false,
    );
  });
});

describe("a number field's unit", () => {
  it("writes the unit in the field, translated", async () => {
    await mount(await load("InputNumber"), {
      modelValue: 30,
      suffix: "$billing.days",
    });
    const suffix = host.querySelector<HTMLElement>("[data-field-suffix]")!;
    expect(suffix.textContent?.trim()).toBe("t($billing.days)");
    expect(suffix.className).toContain("absolute");
    expect(host.querySelector("input")!.hasAttribute("suffix")).toBe(false);
  });

  it("makes room for the unit at the end of the value", async () => {
    await mount(await load("InputNumber"), { modelValue: 30, suffix: "h" });
    const wrapper = host.querySelector<HTMLElement>(":scope > *")!;
    expect(wrapper.style.getPropertyValue("--dms-field-suffix-width")).toBe(
      "1ch",
    );
    expect(host.querySelector("input")!.getAttribute("ui")).toBeNull();
    expect(ui.at(-1)?.base).toContain(
      "pe-[calc(var(--dms-field-suffix-width)+2.375rem)]",
    );
  });

  it("draws no unit by default", async () => {
    await mount(await load("InputNumber"), { modelValue: 30 });
    expect(host.querySelector("[data-field-suffix]")).toBeNull();
  });
});

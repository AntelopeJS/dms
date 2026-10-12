// @vitest-environment jsdom
/**
 * A number field keeps a typed value within its bounds and on its steps when
 * it is left or on Enter. It says so with `adjust` — 1020 typed in a field of
 * steps of 50 kept as 1,000 — and draws the kept value again, so a module
 * shows "1020 → 1,000" without remounting the field.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  type Component,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
} from "vue";
import {
  numberAdjustment,
  parseTypedNumber,
} from "../layers/dms-ui/app/build/utils/numberAdjustment";
import type { InputNumberAdjustment } from "../layers/dms-ui/app/types/input-number";

let app: App | undefined;
let host: HTMLDivElement;

// The Nuxt UI field as far as the wrapper sees it: it applies the typed text
// on blur or Enter, kept within `min` / `max` and on `step`, then emits blur.
const NumberField = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: Number, default: undefined },
    min: { type: Number, default: undefined },
    max: { type: Number, default: undefined },
    step: { type: Number, default: 1 },
  },
  emits: ["update:modelValue", "blur"],
  setup(props, { emit }) {
    const apply = (input: HTMLInputElement) => {
      const typed = Number(input.value.replace(/,/g, ""));
      const bounded = Math.min(
        props.max ?? Infinity,
        Math.max(props.min ?? -Infinity, typed),
      );
      emit("update:modelValue", Math.round(bounded / props.step) * props.step);
    };
    return () =>
      h("input", {
        onBlur: (event: FocusEvent) => {
          apply(event.target as HTMLInputElement);
          emit("blur", event);
        },
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === "Enter") apply(event.target as HTMLInputElement);
        },
      });
  },
});

async function mount(props: Record<string, unknown>) {
  const value = ref<number | undefined>(props.modelValue as number);
  const adjustments: InputNumberAdjustment[] = [];
  const field = (
    await import(
      "../layers/dms-ui/app/components/form/components/InputNumber.vue"
    )
  ).default as Component;
  app = createApp({
    render: () =>
      h(field, {
        ...props,
        modelValue: value.value,
        "onUpdate:modelValue": (next: number) => (value.value = next),
        onAdjust: (adjustment: InputNumberAdjustment) =>
          adjustments.push(adjustment),
      }),
  });
  app.component("UInputNumber", NumberField);
  app.mount(host);
  await nextTick();
  return { value, adjustments, input: host.querySelector("input")! };
}

async function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function settled() {
  await nextTick();
  await nextTick();
}

beforeEach(() => {
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useI18n", () => ({ locale: ref("en") }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("parseTypedNumber", () => {
  it("reads a number as the locale writes it", () => {
    expect(parseTypedNumber("1,020", "en")).toBe(1020);
    expect(parseTypedNumber(" -100 ", "en")).toBe(-100);
    expect(parseTypedNumber("1 020,5", "fr")).toBe(1020.5);
    expect(parseTypedNumber("", "en")).toBeNull();
    expect(parseTypedNumber("abc", "en")).toBeNull();
  });
});

describe("numberAdjustment", () => {
  it("names the bound or the step the value was kept on", () => {
    const bounds = { min: 0, max: 5000 };
    expect(numberAdjustment(9000, 5000, bounds)?.reason).toBe("max");
    expect(numberAdjustment(-3, 0, bounds)?.reason).toBe("min");
    expect(numberAdjustment(1020, 1000, bounds)).toEqual({
      typed: 1020,
      value: 1000,
      reason: "step",
    });
    expect(numberAdjustment(1000, 1000, bounds)).toBeNull();
    expect(numberAdjustment(null, 1000, bounds)).toBeNull();
  });
});

describe("DmsInputNumber adjust", () => {
  it("says the field kept a typed value on its steps when it is left", async () => {
    const { input, adjustments, value } = await mount({
      modelValue: 1000,
      step: 50,
      min: 0,
    });
    await type(input, "1020");
    input.dispatchEvent(new FocusEvent("blur"));
    await settled();
    expect(value.value).toBe(1000);
    expect(adjustments).toEqual([{ typed: 1020, value: 1000, reason: "step" }]);
  });

  it("says the field kept a typed value within its maximum on Enter", async () => {
    const { input, adjustments } = await mount({ modelValue: 10, max: 100 });
    await type(input, "250");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await settled();
    expect(adjustments).toEqual([{ typed: 250, value: 100, reason: "max" }]);
  });

  it("redraws the kept value through the field's change handler", async () => {
    const { input } = await mount({ modelValue: 1000, step: 50 });
    const changes = vi.fn();
    input.addEventListener("change", changes);
    await type(input, "1020");
    input.dispatchEvent(new FocusEvent("blur"));
    await settled();
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the field keeps what was typed, or nothing was typed", async () => {
    const { input, adjustments } = await mount({ modelValue: 10, step: 5 });
    input.dispatchEvent(new FocusEvent("blur"));
    await type(input, "15");
    input.dispatchEvent(new FocusEvent("blur"));
    await settled();
    expect(adjustments).toEqual([]);
  });
});

/** @vitest-environment jsdom */
/**
 * A number field clamps a value typed outside `min` / `max` into range on
 * blur, as the input does by default. With `clamp: false` it keeps the value
 * as typed and reports it as the field's error, which blocks the submit; its
 * steppers stop at the bounds.
 */
import { formFieldInjectionKey } from "@nuxt/ui/composables/useFormField";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  type SetupContext,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
} from "vue";
import { FORM_CONTROL_ERRORS_KEY } from "../layers/dms-ui/app/entries/composables/form/formControlErrors";
import type InputNumberField from "../layers/dms-ui/app/components/form/components/InputNumber.vue";
import {
  ABOVE_MAX_MESSAGE,
  BELOW_MIN_MESSAGE,
  numberRangeError,
  numberStepperState,
} from "../layers/dms-ui/app/entries/composables/form/numberRange";

let app: App | undefined;
let host: HTMLDivElement;
let inputAttrs: SetupContext["attrs"] = {};
const reported = new Map<string, string | undefined>();

const InputNumberStub = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { attrs }) =>
    () => {
      inputAttrs = { ...attrs };
      return h("input");
    },
});

async function mount(
  props: Partial<InstanceType<typeof InputNumberField>["$props"]>,
) {
  const { default: InputNumber } = await import(
    "../layers/dms-ui/app/components/form/components/InputNumber.vue"
  );
  const value = ref(props.modelValue);
  app = createApp({
    render: () => h(InputNumber, { ...props, modelValue: value.value }),
  });
  app.component("UInputNumber", InputNumberStub);
  app.provide(
    formFieldInjectionKey,
    computed(() => ({ name: "budget", ariaId: "budget" })),
  );
  app.provide(FORM_CONTROL_ERRORS_KEY, {
    report: (fieldId: string, message: string | undefined) =>
      reported.set(fieldId, message),
  });
  app.mount(host);
  await nextTick();
  return value;
}

beforeEach(() => {
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useI18n", () => ({ locale: ref("en") }));
  host = document.createElement("div");
  document.body.append(host);
  reported.clear();
  inputAttrs = {};
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("numberRangeError", () => {
  it("names the bound a value crosses", () => {
    const bounds = { min: 1, max: 10 };
    expect(numberRangeError(0, bounds)).toBe(BELOW_MIN_MESSAGE);
    expect(numberRangeError(11, bounds)).toBe(ABOVE_MAX_MESSAGE);
    expect(numberRangeError(5, bounds)).toBeUndefined();
    expect(numberRangeError(undefined, bounds)).toBeUndefined();
    expect(numberRangeError(Number.NaN, bounds)).toBeUndefined();
  });
});

describe("numberStepperState", () => {
  it("stops the steppers at the bounds", () => {
    expect(numberStepperState(10, { min: 1, max: 10 })).toEqual({
      incrementDisabled: true,
      decrementDisabled: false,
    });
    expect(numberStepperState(0, { min: 1 })).toEqual({
      incrementDisabled: false,
      decrementDisabled: true,
    });
    expect(numberStepperState(undefined, { min: 1, max: 10 })).toEqual({
      incrementDisabled: false,
      decrementDisabled: false,
    });
  });
});

describe("a number field", () => {
  it("hands its bounds to the input by default, which clamps", async () => {
    await mount({ modelValue: 50, min: 1, max: 10 });
    expect(inputAttrs.min).toBe(1);
    expect(inputAttrs.max).toBe(10);
    expect(reported.get("budget")).toBeUndefined();
  });

  it("keeps an out-of-range value and reports it with clamp: false", async () => {
    await mount({ modelValue: 50, min: 1, max: 10, clamp: false });
    expect(inputAttrs.min).toBeUndefined();
    expect(inputAttrs.max).toBeUndefined();
    expect(inputAttrs.incrementDisabled).toBe(true);
    expect(reported.get("budget")).toBe(ABOVE_MAX_MESSAGE);
  });

  it("clears the error once the value is back in range", async () => {
    const value = await mount({ modelValue: 0, min: 1, clamp: false });
    expect(reported.get("budget")).toBe(BELOW_MIN_MESSAGE);
    value.value = 3;
    await nextTick();
    expect(reported.get("budget")).toBeUndefined();
  });
});

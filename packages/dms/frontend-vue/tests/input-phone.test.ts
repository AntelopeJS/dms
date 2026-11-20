/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  provide,
  ref,
  watch,
} from "vue";
import { defu } from "defu";
import { createI18n } from "vue-i18n";
import coreEn from "../layers/dms-core/app/entries/i18n/locales/core-en-GB.json";
import coreFr from "../layers/dms-core/app/entries/i18n/locales/core-fr-FR.json";
import uiEn from "../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";
import uiFr from "../layers/dms-ui/app/entries/i18n/locales/ui-fr-FR.json";
import { formFieldInjectionKey } from "@nuxt/ui/composables/useFormField";
import { FORM_CONTROL_ERRORS_KEY } from "../layers/dms-ui/app/entries/composables/form/formControlErrors";

const i18n = createI18n({
  legacy: false,
  locale: "en-GB",
  fallbackLocale: "en-GB",
  messages: { "en-GB": defu(uiEn, coreEn), "fr-FR": defu(uiFr, coreFr) },
});

const model = ref<string | null | undefined>();
const reported = new Map<string, string | undefined>();
let typeNumber: (text: string) => void = () => {};
let blurNumber: () => void = () => {};
let pickCountry: (code: string) => void = () => {};
let app: App | undefined;
let host: HTMLDivElement;

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

const UInputStub = defineComponent({
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue", "blur"],
  setup(props, { emit }) {
    typeNumber = (text) => emit("update:modelValue", text);
    blurNumber = () => emit("blur");
    return () => h("input", { value: props.modelValue, "data-number": "" });
  },
});

interface CountryItem {
  value: string;
  label: string;
}

const USelectMenuStub = defineComponent({
  props: {
    modelValue: { type: String, default: undefined },
    items: { type: Array<CountryItem>, default: () => [] },
  },
  emits: ["update:modelValue"],
  setup(props, { emit, slots }) {
    pickCountry = (code) => emit("update:modelValue", code);
    return () => [
      h(
        "button",
        { "data-country": props.modelValue ?? "" },
        slots.default?.(),
      ),
      h(
        "ul",
        props.items.map((item) =>
          h("li", { "data-item": item.value }, [
            h("span", { "data-label": "" }, item.label),
            slots["item-trailing"]?.({ item }),
          ]),
        ),
      ),
      h("p", { "data-empty": "" }, slots.empty?.({ searchTerm: "zz" })),
    ];
  },
});

async function mount(props: {
  defaultCountry?: string;
  requiredPrefix?: boolean;
}): Promise<void> {
  const { default: InputPhone } = await import(
    "../layers/dms-ui/app/components/form/components/InputPhone.vue"
  );
  const Field = defineComponent({
    setup() {
      provide(
        formFieldInjectionKey,
        computed(() => ({ name: "phone", ariaId: "field-phone" })),
      );
      provide(FORM_CONTROL_ERRORS_KEY, {
        report: (field: string, message: string | undefined) =>
          reported.set(field, message),
      });
      return () =>
        h(InputPhone, {
          ...props,
          modelValue: model.value,
          "onUpdate:modelValue": (value: string | null | undefined) => {
            model.value = value;
          },
        });
    },
  });
  app = createApp(Field);
  app.component("UInput", UInputStub);
  app.component("USelectMenu", USelectMenuStub);
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.mount(host);
  await flush();
}

const shown = () =>
  host.querySelector<HTMLInputElement>("[data-number]")?.value;
const selected = () =>
  host.querySelector("[data-country]")?.getAttribute("data-country");
const trigger = () => host.querySelector("[data-country]")?.textContent?.trim();
const listed = (code: string) =>
  host.querySelector(`[data-item="${code}"] [data-label]`)?.textContent;

beforeEach(() => {
  for (const [name, value] of Object.entries({
    computed,
    ref,
    watch,
    inject,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("useI18n", () => i18n.global);
  i18n.global.locale.value = "en-GB";
  model.value = undefined;
  reported.clear();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("starts on defaultCountry and stores a national number in E.164", async () => {
  await mount({ defaultCountry: "BE" });
  expect(selected()).toBe("BE");

  typeNumber("0494669443");
  await flush();
  expect(model.value).toBe("+32494669443");
  expect(shown()).toBe("0494 66 94 43");

  blurNumber();
  await flush();
  expect(shown()).toBe("+32 494 66 94 43");
  expect(reported.get("phone")).toBeUndefined();
});

it("shows a stored value internationally, on its country", async () => {
  model.value = "+33123456789";
  await mount({ defaultCountry: "BE" });
  expect(shown()).toBe("+33 1 23 45 67 89");
  expect(selected()).toBe("FR");
});

it("selects the country a typed prefix names", async () => {
  await mount({ defaultCountry: "BE" });
  typeNumber("0033 1 23 45 67 89");
  await flush();
  expect(selected()).toBe("FR");
  expect(shown()).toBe("+33 1 23 45 67 89");
  expect(model.value).toBe("+33123456789");
});

it("keeps a number it cannot read as typed and refuses it on blur", async () => {
  await mount({ defaultCountry: "BE" });
  typeNumber("12");
  await flush();
  blurNumber();
  await flush();
  expect(model.value).toBe("12");
  expect(reported.get("phone")).toBe(
    "Enter a valid phone number, with its country.",
  );

  typeNumber("0494669443");
  await flush();
  expect(reported.get("phone")).toBeUndefined();
});

it("refuses nothing it cannot read without defaultCountry or requiredPrefix", async () => {
  await mount({});
  typeNumber("0494669443");
  await flush();
  blurNumber();
  await flush();
  expect(model.value).toBe("0494669443");
  expect(reported.get("phone")).toBeUndefined();
});

it("reads the number again in the country picked", async () => {
  await mount({ requiredPrefix: true });
  typeNumber("0494669443");
  await flush();
  expect(model.value).toBe("0494669443");

  pickCountry("BE");
  await flush();
  expect(model.value).toBe("+32494669443");
});

it("keeps what the user deleted instead of formatting it back", async () => {
  await mount({ defaultCountry: "US" });
  typeNumber("2025550");
  await flush();
  const formatted = shown() ?? "";
  typeNumber(formatted.slice(0, -1));
  await flush();
  expect(shown()).toBe(formatted.slice(0, -1));
});

it("shows the selected country's code and calling code, and lists each country with its calling code", async () => {
  await mount({ defaultCountry: "BE" });
  expect(trigger()).toBe("BE +32");
  expect(host.querySelector('[data-item="BE"]')?.textContent).toBe(
    "Belgium+32",
  );
});

it("names the countries as the DMS translations do, and offers none they leave out", async () => {
  await mount({ defaultCountry: "BE" });
  expect(listed("BA")).toBe("Bosnia and Herzegovina");
  expect(host.querySelector('[data-item="XK"]')).toBeNull();
});

it("speaks the user's language: French message and country names", async () => {
  i18n.global.locale.value = "fr-FR";
  await mount({ defaultCountry: "BE" });
  expect(listed("BE")).toBe("Belgique");
  expect(listed("DE")).toBe("Allemagne");
  expect(host.querySelector("[data-empty]")?.textContent).toBe(
    "Aucun pays ne correspond à « zz ».",
  );

  typeNumber("12");
  await flush();
  blurNumber();
  await flush();
  expect(reported.get("phone")).toBe(
    "Saisissez un numéro de téléphone valide, avec son pays.",
  );
});

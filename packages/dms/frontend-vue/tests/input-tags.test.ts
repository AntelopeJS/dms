// @vitest-environment jsdom
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
import {
  formErrorsInjectionKey,
  formFieldInjectionKey,
} from "@nuxt/ui/composables/useFormField";
import { FORM_CONTROL_ERRORS_KEY } from "../layers/dms-ui/app/build/composables/form/useControlError";

const formErrors = ref<Array<Record<string, unknown>>>([]);
const model = ref<string[]>([]);
const reported = new Map<string, string | undefined>();
let emitTags: (tags: string[]) => void = () => {};

let app: App | undefined;
let host: HTMLDivElement;

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

// Renders each tag through the component's `item-text` slot, and hands the
// test the way the tags input reports a change.
const InputTagsStub = defineComponent({
  props: { modelValue: { type: Array, default: () => [] } },
  emits: ["update:modelValue"],
  setup(props, { slots, emit }) {
    emitTags = (tags) => emit("update:modelValue", tags);
    return () =>
      h(
        "div",
        props.modelValue.map((item) =>
          h("span", { class: "tag" }, slots["item-text"]?.({ item })),
        ),
      );
  },
});

async function mountTags(props: Record<string, unknown>): Promise<void> {
  const { default: InputTags } = await import(
    "../layers/dms-ui/app/components/form/components/InputTags.vue"
  );
  const Field = defineComponent({
    setup() {
      provide(
        formFieldInjectionKey,
        computed(() => ({ name: "emails", ariaId: "field-emails" })) as never,
      );
      provide(formErrorsInjectionKey, formErrors as never);
      provide(FORM_CONTROL_ERRORS_KEY, {
        report: (field: string, message: string | undefined) =>
          reported.set(field, message),
      });
      return () =>
        h(InputTags, {
          id: "emails",
          ...props,
          modelValue: model.value,
          "onUpdate:modelValue": (value: string[]) => {
            model.value = value;
          },
        });
    },
  });
  app = createApp(Field);
  app.component("UInputTags", InputTagsStub);
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.mount(host);
  await flush();
}

const flagged = () =>
  [...host.querySelectorAll("[data-flagged]")].map((tag) =>
    tag.textContent?.trim(),
  );

beforeEach(() => {
  for (const [name, value] of Object.entries({
    computed,
    ref,
    watch,
    inject,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, named?: Record<string, unknown>) =>
      `${key} ${Object.values(named ?? {}).join("/")}`,
  }));
  formErrors.value = [];
  model.value = [];
  reported.clear();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("keeps each address once, in lower case, up to max", async () => {
  await mountTags({ itemType: "email", max: 2 });
  emitTags(["Ana@test.local", "ana@test.local", "bob@test.local", "c@d.io"]);
  await flush();

  expect(model.value).toEqual(["ana@test.local", "bob@test.local"]);
});

it("turns an item that is no address red, and refuses the field", async () => {
  await mountTags({ itemType: "email" });
  emitTags(["ana@test.local", "not-an-address"]);
  await flush();

  expect(flagged()).toEqual(["not-an-address"]);
  expect(reported.get("emails")).toBe(
    "dms.form.tags.invalid_email not-an-address",
  );

  emitTags(["ana@test.local"]);
  await flush();
  expect(reported.get("emails")).toBeUndefined();
});

it("marks the addresses a server error names", async () => {
  model.value = ["ana@test.local", "bob@test.local"];
  await mountTags({ itemType: "email" });
  formErrors.value = [
    { name: "emails", message: "Already a member", values: ["BOB@test.local"] },
  ];
  await flush();

  expect(flagged()).toEqual(["bob@test.local"]);
});

/** @vitest-environment jsdom */
/**
 * A form field hands its component the context props (initial value,
 * loading, component, page and route ids) that component declares, and no
 * other, so they never land on its root element as HTML attributes. A
 * localized field does the same for each locale's control.
 */
import {
  computed,
  createApp,
  defineAsyncComponent,
  defineComponent,
  h,
  inject,
  nextTick,
  ref,
  Suspense,
  watch,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDmsComponent } from "#dms/frontend-module";
import LocalizedField from "../layers/dms-ui/app/components/form/LocalizedField.vue";
import { FORM_ENTRY_CONTEXT_KEY } from "../layers/dms-ui/app/entries/composables/form/formEntryContext";

const CONTEXT_ATTRIBUTES = [
  "initial-value",
  "initialvalue",
  "loading",
  "component-id",
  "componentid",
  "page-id",
  "pageid",
  "route-params",
  "routeparams",
];

const Undeclaring = defineComponent({
  props: { modelValue: { type: null, default: undefined } },
  setup: () => () => h("div", { class: "undeclaring" }),
});

/** @type {unknown[]} */
let seenInSetup = [];
const Declaring = defineComponent({
  props: {
    modelValue: { type: null, default: undefined },
    initialValue: { type: null, default: undefined },
    routeParams: { type: Object, default: undefined },
  },
  setup(props) {
    seenInSetup.push(props.initialValue);
    return () => h("div", { class: "declaring" });
  },
});

registerDmsComponent("DmsOfferedPropsUndeclaring", Undeclaring);
registerDmsComponent("DmsOfferedPropsDeclaring", Declaring);

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      slots.default?.(),
});

/** @type {import("vue").App | undefined} */
let app;

/**
 * @param {{ id: string, localized?: boolean, component: { componentName: string } }} field
 * @param {Record<string, unknown>} initialValues
 */
async function mountField(field, initialValues) {
  const { default: FormFieldControl } = await import(
    "../layers/dms-ui/app/entries/components/form/FormFieldControl"
  );
  const root = document.createElement("div");
  app = createApp({
    setup: () => () => h(Suspense, null, () => h(FormFieldControl, { field })),
  });
  app.provide(FORM_ENTRY_CONTEXT_KEY, {
    state: ref({ [field.id]: undefined }),
    initialValues: ref(initialValues),
    loading: ref(false),
    componentId: "form-1",
    pageId: "page-1",
    routeParams: { id: "42" },
    isFieldDisabled: () => false,
  });
  app.config.globalProperties.$t = String;
  app.component("UFormField", Slot);
  app.component("UButton", Slot);
  app.component(
    "UCollapsible",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          slots.content?.(),
    }),
  );
  app.component("UCard", Slot);
  app.component("DmsLocalizedField", LocalizedField);
  app.mount(root);
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
  return root;
}

/** @param {Element | null} element */
function contextAttributes(element) {
  return CONTEXT_ATTRIBUTES.filter((name) => element?.hasAttribute(name));
}

describe("a form field's context props", () => {
  beforeEach(() => {
    seenInSetup = [];
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("inject", inject);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("useI18n", () => ({
      t: String,
      locale: ref("en"),
      locales: ref([
        { code: "en", name: "English" },
        { code: "fr", name: "Français" },
      ]),
    }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    vi.stubGlobal("resolveDmsComponent", () => undefined);
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("put no attribute on a component that declares none of them", async () => {
    vi.stubGlobal("resolveDmsComponent", () => Undeclaring);
    const root = await mountField(
      { id: "site", component: { componentName: "dms-site" } },
      { site: { _id: "site-1" } },
    );
    const element = root.querySelector(".undeclaring");
    expect(element).not.toBeNull();
    expect(contextAttributes(element)).toEqual([]);
  });

  it("reach a lazily loaded component that declares them from its first setup", async () => {
    vi.stubGlobal("resolveDmsComponent", () =>
      defineAsyncComponent(() => Promise.resolve(Declaring)),
    );
    const root = await mountField(
      { id: "site", component: { componentName: "dms-site" } },
      { site: { _id: "site-1" } },
    );
    expect(root.querySelector(".declaring")).not.toBeNull();
    expect(seenInSetup).toEqual([{ _id: "site-1" }]);
    expect(contextAttributes(root.querySelector(".declaring"))).toEqual([]);
  });

  it("put no attribute on a localized field's component that declares none of them", async () => {
    const root = await mountField(
      {
        id: "title",
        localized: true,
        component: { componentName: "DmsOfferedPropsUndeclaring" },
      },
      { title: { en: "Hello", fr: "Bonjour" } },
    );
    const elements = [...root.querySelectorAll(".undeclaring")];
    expect(elements).toHaveLength(2);
    expect(elements.flatMap(contextAttributes)).toEqual([]);
  });

  it("hand a localized field's component the initial value of the current locale it declares", async () => {
    await mountField(
      {
        id: "title",
        localized: true,
        component: { componentName: "DmsOfferedPropsDeclaring" },
      },
      { title: { en: "Hello", fr: "Bonjour" } },
    );
    expect(seenInSetup).toEqual(["Hello", undefined]);
  });
});

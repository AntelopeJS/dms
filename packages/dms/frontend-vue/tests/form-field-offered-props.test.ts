/** @vitest-environment jsdom */
/**
 * A form field hands its component the context props (initial value,
 * loading, component, page and route ids) that component declares, and no
 * other, so they never land on its root element as HTML attributes.
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
  shallowRef,
  Suspense,
  watch,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

let seenInSetup: unknown[] = [];
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

let app: App | undefined;

async function mountField(registered: Component): Promise<HTMLElement> {
  vi.stubGlobal("resolveDmsComponent", () => registered);
  const { default: FormFieldControl } = await import(
    "../layers/dms-ui/app/entries/components/form/FormFieldControl"
  );
  const field = { id: "site", component: { componentName: "dms-site" } };
  const root = document.createElement("div");
  app = createApp({
    setup: () => () => h(Suspense, null, () => h(FormFieldControl, { field })),
  });
  app.provide(FORM_ENTRY_CONTEXT_KEY, {
    state: ref({ site: "site-2" }),
    initialValues: ref({ site: { _id: "site-1" } }),
    loading: ref(false),
    componentId: "form-1",
    pageId: "page-1",
    routeParams: { id: "42" },
    isFieldDisabled: () => false,
  } as never);
  app.component(
    "UFormField",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          slots.default?.(),
    }),
  );
  app.mount(root);
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
  return root;
}

function contextAttributes(element: Element | null): string[] {
  return CONTEXT_ATTRIBUTES.filter((name) => element?.hasAttribute(name));
}

describe("a form field's context props", () => {
  beforeEach(() => {
    seenInSetup = [];
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("inject", inject);
    vi.stubGlobal("shallowRef", shallowRef);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("useI18n", () => ({ t: String, locale: ref("en-GB") }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: (t: string) => t }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("put no attribute on a component that declares none of them", async () => {
    const root = await mountField(Undeclaring);
    const element = root.querySelector(".undeclaring");
    expect(element).not.toBeNull();
    expect(contextAttributes(element)).toEqual([]);
  });

  it("reach a lazily loaded component that declares them from its first setup", async () => {
    const root = await mountField(
      defineAsyncComponent(() => Promise.resolve(Declaring)),
    );
    expect(root.querySelector(".declaring")).not.toBeNull();
    expect(seenInSetup).toEqual([{ _id: "site-1" }]);
    expect(contextAttributes(root.querySelector(".declaring"))).toEqual([]);
  });
});

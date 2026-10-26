/** @vitest-environment jsdom */
/**
 * A read-only relation (a ResourceForm in view mode, a disabled field) shows
 * the related row's label and avatar, as the edit form's picker and the table
 * cell do, rather than the id the form state holds.
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  ref,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapRelationBeforeState,
  sameRelationValue,
} from "../layers/dms-ui/app/build/composables/data-types/relationValue";
import { readonlyFieldValue } from "../layers/dms-ui/app/build/composables/form/readonlyValue";
import { FORM_ENTRY_CONTEXT_KEY } from "../layers/dms-ui/app/build/composables/form/formEntryContext";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";

const relationType: DataType = {
  id: "relation",
  beforeStateMapper: mapRelationBeforeState,
  isSameValue: sameRelationValue,
};
const customer = { _id: "cust-025", name: "Ada Lovelace", avatar: "/a.png" };
const options = {
  keyMapping: { label: "name", value: "_id", avatar: "avatar" },
};

describe("readonlyFieldValue", () => {
  it("shows the joined row while the state still references it", () => {
    expect(
      readonlyFieldValue("cust-025", customer, relationType, options),
    ).toBe(customer);
  });

  it("shows the joined rows of a multiple relation", () => {
    const sites = [
      { _id: "site-39", name: "Liège" },
      { _id: "site-40", name: "Namur" },
    ];
    expect(
      readonlyFieldValue(["site-40", "site-39"], sites, relationType, {
        ...options,
        multiple: true,
      }),
    ).toBe(sites);
  });

  it("keeps the state once it references another row, or nothing was loaded", () => {
    expect(
      readonlyFieldValue("cust-026", customer, relationType, options),
    ).toBe("cust-026");
    expect(
      readonlyFieldValue("cust-025", undefined, relationType, options),
    ).toBe("cust-025");
  });

  it("keeps the state of a type whose state is the value it loaded", () => {
    expect(
      readonlyFieldValue("open", "closed", { id: "string" }, undefined),
    ).toBe("open");
  });
});

describe("a disabled relation field", () => {
  let app: App | undefined;
  let shown: unknown[] = [];

  beforeEach(() => {
    shown = [];
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("inject", inject);
    vi.stubGlobal("useI18n", () => ({ t: String, locale: ref("en-GB") }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: (t: string) => t }));
    vi.stubGlobal("useDataTypes", () => ({
      getDataType: (id: string) =>
        id === "relation" ? relationType : undefined,
    }));
    vi.stubGlobal("resolveDmsComponent", () => undefined);
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("hands its display the row the server joined, not the id", async () => {
    const { default: FormFieldControl } = await import(
      "../layers/dms-ui/app/build/components/form/FormFieldControl.vue"
    );
    const field = {
      id: "customer",
      type: "relation",
      disabled: true,
      component: { componentName: "dms-relation", options },
    };
    app = createApp({
      setup() {
        return () => h(FormFieldControl, { field });
      },
    });
    // oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- This fixture intentionally provides only the context fields read by the disabled control. The full FormEntryContext owner requires unrelated callbacks; inference cannot make the partial provider complete.
    app.provide(FORM_ENTRY_CONTEXT_KEY, {
      state: ref({ customer: "cust-025" }),
      initialValues: ref({ customer }),
      loading: false,
      isFieldDisabled: () => true,
    } as never);
    // oxlint-enable anti-slop/require-safety-comment-for-type-assertion
    app.component(
      "UFormField",
      defineComponent({
        setup:
          (_, { slots }) =>
          () =>
            slots.default?.(),
      }),
    );
    app.component(
      "DmsDisplay",
      defineComponent({
        props: { modelValue: { type: null, default: undefined } },
        setup(props) {
          return () => {
            shown.push(props.modelValue);
            return h("span");
          };
        },
      }),
    );
    app.mount(document.createElement("div"));
    await nextTick();
    expect(shown.at(-1)).toEqual(customer);
  });
});

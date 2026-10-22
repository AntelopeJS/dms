// @vitest-environment jsdom
/**
 * A field group (a table's `@ColumnGroup`) titles a run of fields: its label
 * heads the cluster and each member keeps its own label above its control,
 * so the form stays readable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  ref,
} from "vue";
import {
  FORM_ENTRY_CONTEXT_KEY,
  type FormEntryContext,
} from "../layers/dms-ui/app/build/composables/form/formEntryContext";
import {
  FORM_LAYOUT_CLASSES,
  GROUP_FIELDS_CLASSES,
} from "../layers/dms-ui/app/build/composables/form/formLayout";
import type {
  FormField,
  FormFieldOrGroup,
} from "../layers/dms-ui/app/composables/form/types/field";

vi.mock(
  "../layers/dms-ui/app/build/components/form/FormFieldControl.vue",
  () => ({
    default: defineComponent({
      props: { field: { type: Object, required: true } },
      setup: (props) => () =>
        h("input", { id: (props.field as FormField).id, "data-control": "" }),
    }),
  }),
);
vi.mock("#dms-layout/app/composables/layout/useInstantSaveHeader", () => ({
  combineSaveStates: () => "idle",
}));

const field = (id: string, label?: string): FormField => ({
  id,
  label,
  component: { componentName: "dms-input-text" },
});

const REQUIRED = new Set(["street"]);

const context = {
  state: ref({}),
  initialValues: ref({}),
  loading: ref(false),
  componentId: "form",
  pageId: "page",
  layoutClasses: () => FORM_LAYOUT_CLASSES.horizontal,
  isFieldHidden: (entry: FormField) => entry.id === "hidden",
  isFieldDisabled: () => false,
  isFieldRequired: (entry: FormField) => REQUIRED.has(entry.id),
  isReadOnly: ref(false),
  showsChanges: false,
  isFieldChanged: () => false,
  baselineValue: () => undefined,
  fieldSaveState: () => "idle",
  retrySave: () => {},
} satisfies FormEntryContext;

let app: App | undefined;
let host: HTMLDivElement;

async function mount(entries: FormFieldOrGroup[]) {
  const { default: FormEntries } = await import(
    "../layers/dms-ui/app/build/components/form/FormEntries.vue"
  );
  app = createApp({
    setup() {
      provide(FORM_ENTRY_CONTEXT_KEY, context);
      return () => h(FormEntries, { entries });
    },
  });
  app.mount(host);
  await nextTick();
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim();

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("onUnmounted", onUnmounted);
  vi.stubGlobal("useDefinedFunctions", () => ({
    getFunction: () => undefined,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) =>
      value.startsWith("$") ? `t(${value})` : value,
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("a field group", () => {
  it("heads its cluster and labels each member's control", async () => {
    await mount([
      {
        id: "address",
        label: "Address",
        fields: [field("street", "$street"), field("city", "City")],
      },
    ]);
    const labels = [...host.querySelectorAll("label")];
    expect(labels.map((label) => [label.htmlFor, text(label)])).toEqual([
      ["street", "t($street) *"],
      ["city", "City"],
    ]);
    for (const label of labels) {
      expect(host.querySelector(`#${label.htmlFor}`)?.tagName).toBe("INPUT");
    }
    expect(text(host)).toMatch(/^Address \*/);
  });

  it("leaves a member without a label bare, and drops a hidden one", async () => {
    await mount([
      {
        id: "contact",
        label: "Contact",
        fields: [
          field("email"),
          field("hidden", "Hidden"),
          field("phone", "Phone"),
        ],
      },
    ]);
    expect(
      [...host.querySelectorAll("label")].map((label) => text(label)),
    ).toEqual(["Phone"]);
    expect(host.querySelectorAll("[data-control]")).toHaveLength(2);
  });

  it("wraps a horizontal group's members instead of squeezing them", async () => {
    await mount([
      {
        id: "status",
        label: "Status",
        orientation: "horizontal",
        fields: ["region", "team", "active", "color", "since"].map((id) =>
          field(id, id),
        ),
      },
    ]);
    const cluster =
      host.querySelector("[data-control]")?.parentElement?.parentElement;
    expect(cluster?.className).toBe(GROUP_FIELDS_CLASSES.horizontal);
    expect(cluster?.children).toHaveLength(5);
    // A minimum track width, not equal shares of the row: five controls in a
    // modal wrap onto a second line rather than draw over one another.
    expect(GROUP_FIELDS_CLASSES.horizontal).toMatch(
      /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,\d+rem\),1fr\)\)\]/,
    );
  });
});

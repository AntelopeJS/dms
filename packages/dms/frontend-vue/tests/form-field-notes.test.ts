/** @vitest-environment jsdom */
/**
 * "Module default · Use default" is for a setting whose `defaultValue` is the
 * module's default: a field shows it only when it offers it. A record form —
 * the one a table view generates from its columns — leaves a column's
 * initial value unmentioned.
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
  provide,
  ref,
} from "vue";
import {
  FORM_ENTRY_CONTEXT_KEY,
  type FormEntryContext,
} from "../layers/dms-ui/app/entries/composables/form/formEntryContext";
import type { FormField } from "../layers/dms-ui/app/composables/form/types/field";

const UButton = defineComponent({
  props: { label: { type: String, default: "" } },
  emits: ["click"],
  setup:
    (props, { emit }) =>
    () =>
      h("button", { onClick: () => emit("click") }, props.label),
});

const field = (overrides: Partial<FormField> = {}): FormField => ({
  id: "region",
  type: "string",
  component: { componentName: "dms-input-text" },
  defaultValue: "north",
  ...overrides,
});

let app: App | undefined;
let host: HTMLDivElement;
let state: FormEntryContext["state"];

async function mount(entry: FormField) {
  const { default: FormFieldNotes } = await import(
    "../layers/dms-ui/app/entries/components/form/FormFieldNotes"
  );
  state = ref({ region: "south" });
  const context = {
    state,
    initialValues: ref({ region: "south" }),
    loading: ref(false),
    componentId: "form",
    pageId: "page",
    layoutClasses: () => ({
      rows: "",
      row: { layout: "form", inset: false, spacing: "row" },
    }),
    isFieldHidden: () => false,
    isFieldDisabled: () => false,
    isFieldRequired: () => false,
    showsChanges: true,
    isFieldChanged: () => false,
    baselineValue: () => "south",
    fieldSaveState: () => "idle",
    retrySave: () => {},
  } satisfies FormEntryContext;
  app = createApp({
    setup() {
      provide(FORM_ENTRY_CONTEXT_KEY, context);
      return () => h(FormFieldNotes, { field: entry });
    },
  });
  app.component("UButton", UButton);
  app.mount(host);
  await nextTick();
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("the module-default note", () => {
  it("stays off a record field holding something other than its default", async () => {
    await mount(field());
    expect(host.textContent).not.toContain("dms.form.field_notes.default");
    expect(host.querySelector("button")).toBeNull();
  });

  it("shows on a field that offers its default, and puts it back", async () => {
    await mount(field({ offersDefault: true }));
    expect(host.textContent).toContain("dms.form.field_notes.default");
    expect(host.textContent).toContain("north");
    host.querySelector("button")?.click();
    expect(state.value.region).toBe("north");
  });
});

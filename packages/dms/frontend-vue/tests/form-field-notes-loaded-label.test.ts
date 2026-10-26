/** @vitest-environment jsdom */
/**
 * "Changed · was X" words what a field loaded with. A relation holds the id
 * of its row in the form, the server sent the joined row: the note names the
 * row by its label, not by its id.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  h,
  inject,
  nextTick,
  provide,
  ref,
} from "vue";
import {
  mapRelationBeforeState,
  sameRelationValue,
} from "../layers/dms-ui/app/build/composables/data-types/relationValue";
import { FORM_ENTRY_CONTEXT_KEY } from "../layers/dms-ui/app/build/composables/form/formEntryContext";
import { FORM_LAYOUT_CLASSES } from "../layers/dms-ui/app/build/composables/form/formLayout";
import type { FormField } from "../layers/dms-ui/app/composables/form/types/field";
import type { FormData } from "../layers/dms-ui/app/composables/form/types/value";
import { isString } from "../layers/dms-core/app/utils/type-check";

const wordRow = (value: string | { name: string }): string =>
  isString(value) ? value : String(value.name);
const relationType = {
  id: "relation",
  formatter: {
    default: (
      value: Parameters<typeof wordRow>[0] | Parameters<typeof wordRow>[0][],
    ) =>
      Array.isArray(value) ? value.map(wordRow).join(", ") : wordRow(value),
  },
  beforeStateMapper: mapRelationBeforeState,
  isSameValue: sameRelationValue,
};

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useDataTypes", () => ({
    getDataType: (id: string) => (id === "relation" ? relationType : undefined),
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

interface NotesSetup {
  loaded: FormData[string];
  baseline: FormData[string];
  value: FormData[string];
  options?: FormField["component"]["options"];
}

async function changeNote(setup: NotesSetup): Promise<string> {
  const { default: FormFieldNotes } = await import(
    "../layers/dms-ui/app/build/components/form/FormFieldNotes.vue"
  );
  const field: FormField = {
    id: "customer",
    type: "relation",
    component: { componentName: "DmsRelation", options: setup.options },
  };
  app = createApp({
    setup() {
      provide(FORM_ENTRY_CONTEXT_KEY, {
        state: ref({ customer: setup.value }),
        initialValues: ref({ customer: setup.loaded }),
        loading: ref(false),
        componentId: "notes",
        pageId: "customers",
        layoutClasses: () => FORM_LAYOUT_CLASSES.vertical,
        isFieldHidden: () => false,
        isFieldRequired: () => false,
        isReadOnly: ref(false),
        showsChanges: true,
        isFieldChanged: () => true,
        isFieldDisabled: () => false,
        baselineValue: () => setup.baseline,
        fieldSaveState: () => "idle",
        retrySave: () => {},
      });
      return () => h(FormFieldNotes, { field });
    },
  });
  app.component("UButton", { render: () => null });
  app.mount(host);
  await nextTick();
  return host.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

it("names the row a relation loaded with, not its id", async () => {
  const note = await changeNote({
    loaded: { _id: "cust-006", name: "Ferme du Try" },
    baseline: "cust-006",
    value: "cust-010",
  });

  expect(note).toContain("Ferme du Try");
  expect(note).not.toContain("cust-006");
});

it("names the rows of a multiple relation", async () => {
  const note = await changeNote({
    loaded: [
      { id: "team-12", name: "North crew" },
      { id: "team-3", name: "South crew" },
    ],
    baseline: ["team-12", "team-3"],
    value: ["team-12"],
    options: { multiple: true, keyMapping: { value: "id" } },
  });

  expect(note).toContain("North crew");
  expect(note).not.toContain("team-12");
});

it("words the baseline itself once it is no longer the loaded row", async () => {
  const note = await changeNote({
    loaded: { _id: "cust-006", name: "Ferme du Try" },
    baseline: "cust-010",
    value: "cust-011",
  });

  expect(note).toContain("cust-010");
  expect(note).not.toContain("Ferme du Try");
});

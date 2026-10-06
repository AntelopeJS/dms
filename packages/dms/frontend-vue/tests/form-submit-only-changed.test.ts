import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import {
  collectSubmitData,
  createFieldValueComparer,
  useForm,
} from "../layers/dms-ui/app/composables/form/useForm";
import { sameRelationValue } from "../layers/dms-ui/app/build/composables/data-types/relationValue";

const authFetch = vi.fn();
const RELATION_TYPE = {
  id: "relation",
  isSameValue: sameRelationValue,
};
const getDataType = (type: string) =>
  type === RELATION_TYPE.id ? RELATION_TYPE : undefined;
let scope: EffectScope;

const field = (id: string, type = "string") => ({ id, type });
const FIELDS = ["status", "notes", "owner"].map((id) => ({
  id,
  label: id,
  component: { componentName: "DmsInputText" },
}));
/** The row as it was loaded, before a colleague changed its status. */
const LOADED_ROW = { status: "open", notes: "First call", owner: "ana" };

function setupForm(submitUrlMethod?: HttpMethod, fields: unknown[] = FIELDS) {
  return scope.run(() =>
    useForm({
      componentId: "form-1",
      pageId: "page-1",
      fields,
      fetchUrl: "/api/rows/get?id=row-1",
      submitUrl: "/api/rows/edit?id=row-1",
      submitUrlMethod,
    } as never),
  )!;
}

/** Edits only the notes of the loaded row, then saves. */
async function editNotes(form: ReturnType<typeof setupForm>) {
  form.initialValues.value = { ...LOADED_ROW };
  const edited = { ...LOADED_ROW, notes: "Second call" };
  Object.assign(form.state.value, edited);
  await form.onSubmit({ data: edited } as never);
}

function sentBody(): unknown {
  return authFetch.mock.calls.at(-1)?.[1]?.body;
}

beforeEach(() => {
  scope = effectScope();
  authFetch.mockResolvedValue({ success: true });
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("HttpMethod", HttpMethod);
  vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
  vi.stubGlobal("Color", { error: "error", success: "success", info: "info" });
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "Content-Language");
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key,
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {}, params: {} }));
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: vi.fn() }));
  vi.stubGlobal("useEventedAction", () => ({
    execute: (action: () => Promise<unknown>) => action(),
  }));
  vi.stubGlobal(
    "useWatch",
    (_actions: unknown, _id: unknown, initial: Record<string, unknown>) => ({
      isLoading: ref(false),
      state: ref({ ...initial }),
    }),
  );
  vi.stubGlobal("navigateDms", vi.fn());
});

afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("collectSubmitData with onlyChanged", () => {
  const fields = [field("status"), field("notes"), field("tags")];
  const initialValues = { status: "open", notes: "First", tags: ["a"] };

  it("leaves out the fields still holding the value they loaded", () => {
    expect(
      collectSubmitData(
        { status: "open", notes: "Second", tags: ["a"] },
        fields,
        { initialValues, onlyChanged: true },
      ),
    ).toEqual({ notes: "Second" });
  });

  it("still sends a cleared field as its empty value", () => {
    expect(
      collectSubmitData(
        { status: "open", notes: "First", tags: undefined },
        fields,
        { initialValues, onlyChanged: true },
      ),
    ).toEqual({ tags: [] });
  });

  it("leaves out a relation still referencing the rows it loaded", () => {
    // The server sends the joined row, the picker holds its id.
    const assignees = {
      id: "assignees",
      type: "relation",
      component: { componentName: "DmsInputRelation", options: {} },
    };
    expect(
      collectSubmitData(
        { assignees: "u-1", notes: "Second" },
        [assignees, field("notes")],
        {
          initialValues: {
            assignees: { _id: "u-1", name: "Ann" },
            notes: "First",
          },
          onlyChanged: true,
          isSameValue: createFieldValueComparer(getDataType),
        },
      ),
    ).toEqual({ notes: "Second" });
  });

  it("sends a relation pointing at another row", () => {
    const assignees = { id: "assignees", type: "relation" };
    expect(
      collectSubmitData({ assignees: "u-2" }, [assignees], {
        initialValues: { assignees: { _id: "u-1", name: "Ann" } },
        onlyChanged: true,
        isSameValue: createFieldValueComparer(getDataType),
      }),
    ).toEqual({ assignees: "u-2" });
  });

  it("keeps the submit defaults", () => {
    expect(
      collectSubmitData({ status: "open" }, [field("status")], {
        initialValues,
        submitDefaults: { tenant: "t-1" },
        onlyChanged: true,
      }),
    ).toEqual({ tenant: "t-1" });
  });
});

describe("DMS form submitting a loaded record", () => {
  // Sending the whole form wrote the stale status back over a colleague's
  // change made since the form loaded.
  it("sends only what the user changed when it updates the record", async () => {
    await editNotes(setupForm());
    expect(sentBody()).toEqual({ notes: "Second call" });
  });

  it("leaves out a relation the user did not touch", async () => {
    const assignees = {
      id: "assignees",
      label: "Assignees",
      type: "relation",
      component: {
        componentName: "DmsInputRelation",
        options: { keyMapping: { value: "_id" } },
      },
    };
    const form = setupForm(undefined, [...FIELDS, assignees]);
    form.initialValues.value = {
      ...LOADED_ROW,
      assignees: { _id: "u-1", name: "Ann" },
    };
    const edited = { ...LOADED_ROW, notes: "Second call", assignees: "u-1" };
    Object.assign(form.state.value, edited);
    await form.onSubmit({ data: edited } as never);
    expect(sentBody()).toEqual({ notes: "Second call" });
  });

  it("sends every value when it creates a row from the loaded one", async () => {
    await editNotes(setupForm(HttpMethod.post));
    expect(sentBody()).toEqual({ ...LOADED_ROW, notes: "Second call" });
  });
});

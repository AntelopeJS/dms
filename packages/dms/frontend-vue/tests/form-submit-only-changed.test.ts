import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import {
  collectSubmitData,
  useForm,
} from "../layers/dms-ui/app/composables/form/useForm";

const authFetch = vi.fn();
let scope: EffectScope;

const field = (id: string, type = "string") => ({ id, type });
const FIELDS = ["status", "notes", "owner"].map((id) => ({
  id,
  label: id,
  component: { componentName: "DmsInputText" },
}));
/** The row as it was loaded, before a colleague changed its status. */
const LOADED_ROW = { status: "open", notes: "First call", owner: "ana" };

function setupForm(submitUrlMethod?: HttpMethod) {
  return scope.run(() =>
    useForm({
      componentId: "form-1",
      pageId: "page-1",
      fields: FIELDS,
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
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
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

  it("sends every value when it creates a row from the loaded one", async () => {
    await editNotes(setupForm(HttpMethod.post));
    expect(sentBody()).toEqual({ ...LOADED_ROW, notes: "Second call" });
  });
});

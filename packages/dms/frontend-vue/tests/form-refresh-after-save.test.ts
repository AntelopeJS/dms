import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { useForm } from "../layers/dms-ui/app/composables/form/useForm";

/**
 * A save the server normalizes (a VAT number stripped of its spaces, the
 * empty rows of a list dropped): the form shows what was stored, not what
 * was typed, and stays saved.
 */
const GET_URL = "/api/settings/get";
const EDIT_URL = "/api/settings/edit";
const FIELDS = ["vatNumber", "headers"].map((id) => ({
  id,
  label: id,
  component: { componentName: "DmsInputText" },
}));
const LOADED = { vatNumber: "BE0698968934", headers: [] };
const TYPED = {
  vatNumber: "BE 0698 968 934",
  headers: [
    { name: "X-Token", value: "abc" },
    { name: "", value: "" },
  ],
};
const STORED = {
  vatNumber: "BE0698968934",
  headers: [{ name: "X-Token", value: "abc" }],
};

const authFetch = vi.fn();
let scope: EffectScope;
let stored: () => unknown;

function setupForm(
  props: Record<string, unknown> = {},
  onSaved: () => void = () => undefined,
) {
  return scope.run(() =>
    useForm(
      {
        componentId: "form-1",
        pageId: "page-1",
        fields: FIELDS,
        fetchUrl: GET_URL,
        submitUrl: EDIT_URL,
        ...props,
      } as never,
      { onSaved },
    ),
  )!;
}

async function saveTyped(form: ReturnType<typeof setupForm>) {
  form.initialValues.value = structuredClone(LOADED);
  Object.assign(form.state.value, structuredClone(TYPED));
  await form.onSubmit({ data: structuredClone(TYPED) } as never);
}

const reads = () => authFetch.mock.calls.filter(([url]) => url === GET_URL);

beforeEach(() => {
  scope = effectScope();
  stored = () => structuredClone(STORED);
  authFetch.mockImplementation(async (url: string) =>
    url === GET_URL ? stored() : { success: true },
  );
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

describe("DMS form after a save", () => {
  it("shows the values the server stored, and stays saved", async () => {
    const onSaved = vi.fn();
    const form = setupForm({}, onSaved);

    await saveTyped(form);

    expect(reads()).toHaveLength(1);
    expect(form.state.value).toMatchObject(STORED);
    expect(form.initialValues.value).toMatchObject(STORED);
    expect(form.submitSucceeded.value).toBe(true);
    // Saved once accepted, then again from what it read back.
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it("keeps an edit made while the record is read back", async () => {
    const form = setupForm();
    stored = () => {
      form.state.value.vatNumber = "BE0782533345";
      return structuredClone(STORED);
    };
    await saveTyped(form);
    // Let the state watcher see the edit before the read resolves.
    await Promise.resolve();

    expect(form.state.value.vatNumber).toBe("BE0782533345");
  });

  it("keeps the values sent when the read fails", async () => {
    const form = setupForm();
    stored = () => {
      throw new Error("offline");
    };

    await saveTyped(form);

    expect(form.state.value).toMatchObject(TYPED);
    expect(form.submitSucceeded.value).toBe(true);
  });

  it("reads nothing back for a new row, an action or a redirect", async () => {
    for (const props of [
      { submitUrlMethod: HttpMethod.post },
      { kind: "action" },
      { redirectOnSuccess: "/settings" },
      { fetchUrl: undefined },
    ]) {
      await saveTyped(setupForm(props));
    }

    expect(reads()).toHaveLength(0);
  });
});

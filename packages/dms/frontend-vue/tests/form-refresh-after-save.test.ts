import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { isString } from "../layers/dms-core/app/utils/type-check";
import { formSubmitEvent } from "./helpers/form-submit-event";
import { useForm } from "../layers/dms-ui/app/composables/form/useForm";

/**
 * A save the server normalizes (a VAT number stripped of its spaces, the
 * empty rows of a list dropped): the form shows what the server stored, not
 * what was typed, and stays saved. A route answering the record (a table
 * view's edit route) is read without a second request; a route answering
 * anything else has the form read `fetchUrl` again.
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
// oxlint-disable-next-line anti-slop/no-unknown-returns -- Submit responses deliberately include records, unrelated objects, arrays and undefined; no parsed record owner describes this transport double before useForm handles the response.
let answer: () => unknown;

function setupForm(
  props: Partial<Parameters<typeof useForm>[0]> = {},
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
      },
      { onSaved },
    ),
  )!;
}

async function saveTyped(form: ReturnType<typeof setupForm>) {
  form.initialValues.value = structuredClone(LOADED);
  Object.assign(form.state.value, structuredClone(TYPED));
  await form.onSubmit(formSubmitEvent(structuredClone(TYPED)));
}

const reads = () => authFetch.mock.calls.filter(([url]) => url === GET_URL);

beforeEach(() => {
  scope = effectScope();
  answer = () => structuredClone(STORED);
  authFetch.mockImplementation(async (url: string) =>
    url === EDIT_URL ? answer() : structuredClone(LOADED),
  );
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("HttpMethod", HttpMethod);
  vi.stubGlobal("isString", isString);
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
    execute: <Result>(action: () => Promise<Result>) => action(),
  }));
  vi.stubGlobal(
    "useWatch",
    (
      ...[_actions, _id, initial]: Parameters<
        typeof import("../layers/dms-core/app/composables/watch/useWatch").useWatch
      >
    ) => ({
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
  it("shows the values the route stored, and stays saved", async () => {
    const onSaved = vi.fn();
    const form = setupForm({}, onSaved);

    await saveTyped(form);

    expect(reads()).toHaveLength(0);
    expect(form.state.value).toMatchObject(STORED);
    expect(form.initialValues.value).toMatchObject(STORED);
    expect(form.submitSucceeded.value).toBe(true);

    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it("takes only the form's fields from the answer", async () => {
    answer = () => ({ ...structuredClone(STORED), _id: "s-1", success: true });
    const form = setupForm();

    await saveTyped(form);

    expect(form.state.value).not.toHaveProperty("_id");
    expect(form.state.value).not.toHaveProperty("success");
    expect(form.state.value.vatNumber).toBe(STORED.vatNumber);
  });

  it("reads the record again when the route answers no record", async () => {
    for (const body of [{ success: true }, undefined, ["s-1"]]) {
      authFetch.mockClear();
      answer = () => body;
      authFetch.mockImplementation(async (url: string) =>
        url === EDIT_URL ? answer() : structuredClone(STORED),
      );
      const onSaved = vi.fn();
      const form = setupForm({}, onSaved);

      await saveTyped(form);

      expect(reads(), JSON.stringify(body)).toHaveLength(1);
      expect(form.state.value).toMatchObject(STORED);
      expect(form.initialValues.value).toMatchObject(STORED);
      expect(form.submitSucceeded.value).toBe(true);
      expect(onSaved).toHaveBeenCalledTimes(2);
    }
  });

  it("keeps the values sent when that second read fails", async () => {
    answer = () => ({ success: true });
    authFetch.mockImplementation(async (url: string) => {
      if (url === EDIT_URL) return answer();
      throw new Error("offline");
    });
    const form = setupForm();

    await saveTyped(form);

    expect(form.state.value).toMatchObject(TYPED);
    expect(form.submitSucceeded.value).toBe(true);
  });

  it("applies nothing for a new row, an action or a redirect", async () => {
    answer = () => ({ vatNumber: "as stored" });
    for (const props of [
      { submitUrlMethod: HttpMethod.post, kind: "create" },
      { kind: "action" },
      { redirectOnSuccess: "/settings" },
      { fetchUrl: undefined },
    ]) {
      const form = setupForm(props);
      await saveTyped(form);
      expect(form.state.value.vatNumber, JSON.stringify(props)).not.toBe(
        "as stored",
      );
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { isString } from "../layers/dms-core/app/utils/type-check";
import {
  cloneFormValue,
  snapshotFormState,
  useForm,
} from "../layers/dms-ui/app/composables/form/useForm";

const authFetch = vi.fn();
let scope: EffectScope;

function formOf(props: Partial<Parameters<typeof useForm>[0]> = {}) {
  return scope.run(() =>
    useForm({
      componentId: "form-1",
      pageId: "page-1",
      fields: [],
      fetchUrl: "/api/plans/get?id=pro",
      ...props,
    }),
  )!;
}

beforeEach(() => {
  scope = effectScope();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("isString", isString);
  vi.stubGlobal("HttpMethod", HttpMethod);
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
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: vi.fn() }));
  vi.stubGlobal("useEventedAction", () => ({ execute: vi.fn() }));
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
});

afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("the record a form loaded", () => {
  it("is kept as a clone of the record, not the record itself", async () => {
    const record = { tags: ["a"], title: "t" };
    authFetch.mockResolvedValue(record);
    const form = formOf();
    await form.fetchData();
    expect(form.initialValues.value).toEqual(record);
    expect(form.initialValues.value.tags).not.toBe(record.tags);
  });

  it("is kept as an empty record when the server sends none", async () => {
    authFetch.mockResolvedValue(JSON.parse("null"));
    const form = formOf();
    await form.fetchData();
    expect(form.initialValues.value).toEqual({});
  });

  it("is kept as an empty record when the server sends a list", async () => {
    authFetch.mockResolvedValue(JSON.parse("[1, 2]"));
    const form = formOf();
    await form.fetchData();
    expect(form.initialValues.value).toEqual({});
  });
});

describe("cloneFormValue", () => {
  it("keeps a value without clone as undefined", () => {
    expect(cloneFormValue(undefined)).toBeUndefined();
  });

  it("reads a date back as the string a JSON clone makes of it", () => {
    expect(cloneFormValue(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });
});

describe("snapshotFormState", () => {
  it("leaves out a field that holds nothing", () => {
    expect(
      Object.keys(snapshotFormState({ title: "saved", note: undefined })),
    ).toEqual(["title"]);
  });
});

describe("the validation schema of a form", () => {
  it("is an empty object schema when the schema is not an object", () => {
    const form = formOf({ schema: { type: "string" } });
    expect(Object.keys(form.validationSchema.value.shape)).toEqual([]);
  });

  it("has the fields of an object schema", () => {
    const form = formOf({
      schema: { type: "object", properties: { title: { type: "string" } } },
    });
    expect(Object.keys(form.validationSchema.value.shape)).toEqual(["title"]);
  });
});

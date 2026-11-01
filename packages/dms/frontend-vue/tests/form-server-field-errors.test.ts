import { HttpMethod } from "../layers/dms-core/app/types/http";
import { isString } from "../layers/dms-core/app/utils/type-check";
import { formSubmitEvent } from "./helpers/form-submit-event";
import {
  readOnlyFailure,
  installReadOnlyRefusal,
} from "./helpers/read-only-refusal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import {
  type FormServerFieldError,
  resolveFormFieldErrors,
  useForm,
} from "../layers/dms-ui/app/composables/form/useForm";

const authFetch = vi.fn();
const addToast = vi.fn(() => ({ id: "failure" }));
const showFieldErrors = vi.fn<(errors: FormServerFieldError[]) => boolean>();
const hiddenFields = new Set<string>();
let scope: EffectScope;

const FIELDS = [
  { id: "name", label: "Name", component: { componentName: "DmsInputText" } },
  { id: "email", label: "Email", component: { componentName: "DmsInputText" } },
  {
    id: "code",
    label: "Code",
    disabled: true,
    component: { componentName: "DmsInputText" },
  },
];

/** What `assertValidation` answers: the ZodError's issues, as plain text. */
const zodRefusal = (issues: unknown[]) => ({
  statusCode: 400,
  data: JSON.stringify(issues, null, 2),
});

function setupForm() {
  return scope.run(() =>
    useForm(
      {
        componentId: "form-1",
        pageId: "page-1",
        fields: FIELDS,
        submitUrl: "/api/things/new",
      },
      { showFieldErrors },
    ),
  )!;
}

const submit = (form: ReturnType<typeof setupForm>) =>
  form.onSubmit(formSubmitEvent({ name: "", email: "taken@test.local" }));

beforeEach(() => {
  vi.stubEnv("SSR", false);
  scope = effectScope();
  hiddenFields.clear();
  showFieldErrors.mockReturnValue(true);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("isString", isString);
  vi.stubGlobal("HttpMethod", HttpMethod);
  vi.stubGlobal("Color", {
    error: "error",
    success: "success",
    info: "info",
  });
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "Content-Language");
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key,
    processApiMessage: (
      message: string,
      params?: Parameters<
        typeof import("../layers/dms-core/app/composables/translation/useTranslation").resolveApiMessage
      >[2],
    ) =>
      params ? `t(${message}, ${JSON.stringify(params)})` : `t(${message})`,
  }));
  vi.stubGlobal("useI18n", () => ({
    t: (
      key: string,
      named?: Parameters<
        typeof import("../layers/dms-core/app/composables/translation/useTranslation").resolveApiMessage
      >[2],
    ) => (named ? `${key} ${JSON.stringify(named)}` : key),
  }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
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
      state: ref({ ...initial, hiddenFields }),
    }),
  );
  vi.stubGlobal("navigateDms", vi.fn());
});

afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("DMS form server errors", () => {
  it("shows only the generic refusal toast even when the body names a field", async () => {
    installReadOnlyRefusal();
    authFetch.mockRejectedValue(readOnlyFailure());
    await submit(setupForm());
    expect(showFieldErrors).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "error.read_only_demo",
        color: "warning",
      }),
    );
  });

  it("puts a refused value under its field, without a toast", async () => {
    authFetch.mockRejectedValue(
      zodRefusal([
        {
          code: "too_small",
          minimum: 1,
          type: "string",
          message: "String must contain at least 1 character(s)",
          path: ["name"],
        },
      ]),
    );
    await submit(setupForm());

    expect(showFieldErrors).toHaveBeenCalledExactlyOnceWith([
      { name: "name", message: "dms.field_errors.required" },
    ]);
    expect(addToast).not.toHaveBeenCalled();
  });

  it("names the values a refusal lists under the field", async () => {
    installReadOnlyRefusal().mergeLocaleMessage("en", {
      taken: "Already used",
    });
    authFetch.mockRejectedValue({
      statusCode: 409,
      data: {
        message: "$taken",
        field: "email",
        values: ["taken@test.local"],
      },
    });
    await submit(setupForm());

    expect(showFieldErrors).toHaveBeenCalledExactlyOnceWith([
      {
        name: "email",
        message: `dms.field_errors.with_values ${JSON.stringify({
          message: "Already used",
          values: "taken@test.local",
        })}`,
        values: ["taken@test.local"],
      },
    ]);
    expect(addToast).not.toHaveBeenCalled();
  });

  it("fills the message's placeholders from the error's params", async () => {
    installReadOnlyRefusal().mergeLocaleMessage("en", {
      budget_max: "At most {max}",
    });
    authFetch.mockRejectedValue({
      statusCode: 400,
      data: {
        message: "$budget_max",
        field: "name",
        params: { max: 5000 },
      },
    });
    await submit(setupForm());

    expect(showFieldErrors).toHaveBeenCalledExactlyOnceWith([
      { name: "name", message: "At most 5000" },
    ]);
  });

  it("keeps a failure tied to no field as a toast", async () => {
    authFetch.mockRejectedValue({ statusCode: 500, data: "error.unexpected" });
    await submit(setupForm());

    expect(showFieldErrors).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "dms.form.error_unknown",
        description: undefined,
        color: "error",
      }),
    );
  });

  it("toasts a field error no rendered field could show", async () => {
    showFieldErrors.mockReturnValue(false);
    authFetch.mockRejectedValue({
      statusCode: 400,
      data: { code: "missing_mandatory_fields", fields: ["name"] },
    });
    await submit(setupForm());

    expect(showFieldErrors).toHaveBeenCalledOnce();
    expect(addToast).toHaveBeenCalledOnce();
  });

  it("toasts an error on a hidden or disabled field", async () => {
    hiddenFields.add("name");
    authFetch.mockRejectedValue({
      statusCode: 400,
      data: { code: "missing_mandatory_fields", fields: ["name", "code"] },
    });
    await submit(setupForm());

    expect(showFieldErrors).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledOnce();
  });
});

describe("resolveFormFieldErrors", () => {
  it("only resolves to the fields the form shows", () => {
    const error = {
      statusCode: 400,
      data: {
        code: "missing_mandatory_fields",
        fields: ["name", "email", "code"],
      },
    };
    expect(
      resolveFormFieldErrors(error, FIELDS, { hidden: new Set(["email"]) }),
    ).toEqual([{ field: "name", message: "$dms.field_errors.required" }]);
  });
});

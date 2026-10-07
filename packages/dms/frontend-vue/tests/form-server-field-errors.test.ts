import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import {
  type FormServerFieldError,
  resolveFormFieldErrors,
  useForm,
} from "../layers/dms-ui/app/composables/form/useForm";

const authFetch = vi.fn();
const addToast = vi.fn();
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
      } as never,
      { showFieldErrors },
    ),
  )!;
}

const submit = (form: ReturnType<typeof setupForm>) =>
  form.onSubmit({ data: { name: "", email: "taken@test.local" } } as never);

beforeEach(() => {
  scope = effectScope();
  hiddenFields.clear();
  showFieldErrors.mockReturnValue(true);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
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
    processApiMessage: (message: string) => `t(${message})`,
  }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, named?: Record<string, unknown>) =>
      named ? `${key} ${JSON.stringify(named)}` : key,
  }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: vi.fn() }));
  vi.stubGlobal("useEventedAction", () => ({
    execute: (action: () => Promise<unknown>) => action(),
  }));
  vi.stubGlobal(
    "useWatch",
    (_actions: unknown, _id: unknown, initial: Record<string, unknown>) => ({
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
      { name: "name", message: "t($dms.field_errors.required)" },
    ]);
    expect(addToast).not.toHaveBeenCalled();
  });

  it("names the values a refusal lists under the field", async () => {
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
          message: "t($taken)",
          values: "taken@test.local",
        })}`,
        values: ["taken@test.local"],
      },
    ]);
    expect(addToast).not.toHaveBeenCalled();
  });

  it("keeps a failure tied to no field as a toast", async () => {
    authFetch.mockRejectedValue({ statusCode: 500, data: "error.unexpected" });
    await submit(setupForm());

    expect(showFieldErrors).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledExactlyOnceWith({
      title: "$dms.form.error_title",
      description: "t(error.unexpected)",
      color: "error",
    });
  });

  it("toasts a field error no rendered field could show", async () => {
    showFieldErrors.mockReturnValue(false);
    authFetch.mockRejectedValue({
      statusCode: 400,
      data: "Missing mandatory fields: name",
    });
    await submit(setupForm());

    expect(showFieldErrors).toHaveBeenCalledOnce();
    expect(addToast).toHaveBeenCalledOnce();
  });

  it("toasts an error on a hidden or disabled field", async () => {
    hiddenFields.add("name");
    authFetch.mockRejectedValue({
      statusCode: 400,
      data: "Missing mandatory fields: name, code",
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
      data: "Missing mandatory fields: name, email, code",
    };
    expect(
      resolveFormFieldErrors(error, FIELDS, { hidden: new Set(["email"]) }),
    ).toEqual([{ field: "name", message: "$dms.field_errors.required" }]);
  });
});

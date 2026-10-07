// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";
import * as z from "zod";
import {
  codeEntryError,
  focusFirstFormError,
  isBlankValue,
  localizeSchema,
  requiredError,
  useLiveFormErrors,
} from "../layers/dms-core/app/composables/useFormValidation";
import { passwordSchema } from "../layers/dms-ui/app/composables/usePasswordStrength";
import { useCodeFieldError } from "../layers/dms-layout/app/build/composables/settings/security/useCodeFieldError";

/** Marks the keys it translates, so a test sees what went through i18n. */
const translate = (key: string) => `t(${key})`;

async function issuesOf(
  schema: z.ZodTypeAny,
  value: unknown,
): Promise<Array<{ message: string; path?: PropertyKey[] }>> {
  const result = await localizeSchema(schema, translate)["~standard"].validate(
    value,
  );
  return "issues" in result && result.issues ? result.issues : [];
}

describe("isBlankValue / requiredError", () => {
  it.each([undefined, null, "", "   ", [], ["", " "]])(
    "treats %j as not filled",
    (value) => {
      expect(isBlankValue(value)).toBe(true);
      expect(requiredError(value)).toBe("$dms.field_errors.required");
    },
  );

  it.each(["a", 0, false, ["1"]])("treats %j as filled", (value) => {
    expect(isBlankValue(value)).toBe(false);
    expect(requiredError(value)).toBeUndefined();
  });
});

describe("codeEntryError", () => {
  it("says required with no digit, incomplete with some, nothing when full", () => {
    expect(codeEntryError(undefined, 6)).toBe("$dms.field_errors.required");
    expect(codeEntryError(["", "", ""], 6)).toBe("$dms.field_errors.required");
    expect(codeEntryError(["1", "2", "3"], 6)).toBe(
      "$dms.field_errors.code_incomplete",
    );
    expect(codeEntryError(["1", "", "3", "4", "5", "6"], 6)).toBe(
      "$dms.field_errors.code_incomplete",
    );
    expect(codeEntryError(["1", "2", "3", "4", "5", "6"], 6)).toBeUndefined();
  });
});

describe("localizeSchema", () => {
  const login = z.object({
    email: z.string().trim().email(),
    password: z.string().nonempty(),
    name: z.string().trim().min(2),
  });

  it("words an empty field as required, whatever zod checked", async () => {
    expect(await issuesOf(login, {})).toEqual([
      { message: "t(dms.field_errors.required)", path: ["email"] },
      { message: "t(dms.field_errors.required)", path: ["password"] },
      { message: "t(dms.field_errors.required)", path: ["name"] },
    ]);
    // Typed then cleared: still "required", not "invalid e-mail".
    expect(
      await issuesOf(login, { email: " ", password: "", name: "" }),
    ).toEqual([
      { message: "t(dms.field_errors.required)", path: ["email"] },
      { message: "t(dms.field_errors.required)", path: ["password"] },
      { message: "t(dms.field_errors.required)", path: ["name"] },
    ]);
  });

  it("words a malformed value with the dashboard's messages", async () => {
    expect(
      await issuesOf(login, { email: "nope", password: "x", name: "A" }),
    ).toEqual([
      { message: "t(dms.field_errors.invalid_email)", path: ["email"] },
      { message: "t(dms.field_errors.too_short)", path: ["name"] },
    ]);
  });

  it("translates a $key message and keeps one already in prose", async () => {
    const schema = z.object({
      code: z.string().refine(() => false, { message: "$page.custom.key" }),
      note: z.string().refine(() => false, { message: "Already translated" }),
    });
    expect(await issuesOf(schema, { code: "a", note: "b" })).toEqual([
      { message: "t(page.custom.key)", path: ["code"] },
      { message: "Already translated", path: ["note"] },
    ]);
  });

  it("hands the parsed value (transforms applied) back on success", async () => {
    const schema = z.object({
      code: z
        .string()
        .trim()
        .transform((code) => code.toUpperCase()),
    });
    expect(
      await localizeSchema(schema, translate)["~standard"].validate({
        code: " abcd ",
      }),
    ).toEqual({ value: { code: "ABCD" } });
  });

  it("says required for an empty new password, the rules for a weak one", async () => {
    const schema = z.object({ password: passwordSchema });
    expect(await issuesOf(schema, {})).toEqual([
      { message: "t(dms.field_errors.required)", path: ["password"] },
    ]);
    expect((await issuesOf(schema, { password: "" }))[0]).toEqual({
      message: "t(dms.field_errors.required)",
      path: ["password"],
    });
    expect((await issuesOf(schema, { password: "abc" }))[0]).toEqual({
      message: "t(dms.field_errors.password_rules)",
      path: ["password"],
    });
    expect(await issuesOf(schema, { password: "Abcdefg1!" })).toEqual([]);
  });
});

describe("focusFirstFormError", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("focuses the first control in error in page order, once enabled", () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<input id="first" disabled><input id="second"><input id="third">';
    focusFirstFormError([{ id: "third" }, { id: "first" }, { id: "missing" }]);
    // UForm re-enables its fields after emitting the error.
    document.getElementById("first")!.removeAttribute("disabled");
    vi.runAllTimers();
    expect(document.activeElement?.id).toBe("first");
  });
});

describe("useLiveFormErrors", () => {
  it("re-checks a field in error as soon as it changes, only that one", async () => {
    const state = reactive<Record<string, unknown>>({ email: "", name: "" });
    const validate = vi.fn(async () => undefined);
    const errors = new Set(["email"]);
    const form = ref({
      getErrors: (name?: string) => (name && errors.has(name) ? [{}] : []),
      validate,
    });
    useLiveFormErrors(form, state);

    state.name = "Camille";
    await nextTick();
    expect(validate).not.toHaveBeenCalled();

    state.email = "c@example.com";
    await nextTick();
    expect(validate).toHaveBeenCalledExactlyOnceWith({
      name: "email",
      silent: true,
    });
  });
});

describe("useCodeFieldError", () => {
  function setup() {
    const container = document.createElement("div");
    container.innerHTML = "<input><input><input>";
    document.body.append(container);
    const digits = ref<string[]>(["1", "2"]);
    const error = ref<string>();
    const { flag } = useCodeFieldError(digits, error, ref(container));
    return { container, digits, error, flag };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the digits of a code flagged before sending, focuses the gap", async () => {
    const { container, digits, error, flag } = setup();
    container.querySelectorAll("input")[0]!.value = "1";
    flag("Enter every digit of the code.");
    await nextTick();
    await nextTick();
    expect(error.value).toBe("Enter every digit of the code.");
    expect(digits.value).toEqual(["1", "2"]);
    expect(document.activeElement).toBe(container.querySelectorAll("input")[1]);

    // Typing clears it.
    digits.value = ["1", "2", "3"];
    await nextTick();
    expect(error.value).toBeUndefined();
  });

  it("empties the cells after a code the API refused", async () => {
    const { digits, error } = setup();
    error.value = "That code is invalid.";
    await nextTick();
    await nextTick();
    expect(digits.value).toEqual([]);
    expect(error.value).toBe("That code is invalid.");
  });
});

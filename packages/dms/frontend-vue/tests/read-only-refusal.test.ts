/** @vitest-environment jsdom */
import { createApp, nextTick, ref } from "vue";
import { useToast } from "@nuxt/ui/composables/useToast";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as engine from "#dms/frontend-module";
import { useReadOnlyRefusal } from "../layers/dms-core/app/composables/useReadOnlyRefusal";
import { useApiError } from "../layers/dms-core/app/composables/useApiError";
import { useFieldErrors } from "../layers/dms-core/app/composables/useFieldErrors";
import { useAuthFormError } from "../layers/dms-auth/app/entries/composables/useAuthFormError";
import { readOnlyFailure } from "./helpers/read-only-refusal";

const add = vi.fn();

function application() {
  const app = createApp({});
  const runtime = engine.createDmsFrontendRuntime();
  engine.provideDmsFrontendRuntime(app, runtime);
  return { app, runtime, consume: app.runWithContext(useReadOnlyRefusal) };
}

beforeEach(() => {
  add.mockClear();
  vi.stubGlobal("useReadOnlyRefusal", useReadOnlyRefusal);
  vi.stubGlobal("useDmsState", engine.useDmsState);
  vi.stubGlobal("useToast", () => ({ add }));
  vi.stubGlobal("getAppTranslation", () => ({
    processApiMessage: (key: string) => key,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
});

afterEach(() => vi.unstubAllGlobals());

it.each([
  [403, "1", true],
  [403, null, false],
  [403, "true", false],
  [401, "1", false],
  [500, "1", false],
  [200, "1", false],
])(
  "classifies response status %s and marker %s without trusting the body",
  (status, marker, expected) => {
    const headers = new Headers();
    if (marker) headers.set("x-dms-readonly", marker);
    const { consume } = application();
    expect(
      consume({
        response: new Response(null, { status, headers }),
        data: "read only",
      }),
    ).toBe(expected);
    expect(add).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(consume({ status: 403, data: "x-dms-readonly: 1" })).toBe(false);
    expect(consume(null)).toBe(false);
    expect(consume("refused")).toBe(false);
  },
);

it("consumes hook then API, field and both auth presenters once without creating field or inline errors", async () => {
  const { app, consume } = application();
  const error = readOnlyFailure();
  const fields = app.runWithContext(() =>
    useFieldErrors({ fields: { roles: "roles" } }),
  );
  const auth = app.runWithContext(useAuthFormError);
  expect(consume({ response: error.response })).toBe(true);
  app.runWithContext(() => useApiError(error));
  fields.toastError(error, { toastTitle: "save failed" });
  expect(
    await fields.handleApiError(error, { toastTitle: "save failed" }),
  ).toBe(false);
  auth.showFormError(error, "login failed");
  expect(
    await auth.showError(error, "login failed", {
      fields: ["roles"],
      form: ref(null),
    }),
  ).toBe(false);
  expect(fields.errors).toEqual({});
  expect(auth.formError.value).toBeNull();
  expect(add).toHaveBeenCalledExactlyOnceWith({
    id: "dms-read-only",
    color: "warning",
    icon: "i-ph-lock-simple",
    title: "error.read_only_demo",
  });
});

it("notifies a plain-fetch auth refusal without an auth hook and leaves unmarked permissions visible", async () => {
  const { app } = application();
  const auth = app.runWithContext(useAuthFormError);
  const failure = readOnlyFailure();
  expect(
    await auth.showError(failure, "login failed", { fields: ["roles"] }),
  ).toBe(false);
  expect(add).toHaveBeenCalledOnce();
  expect(auth.formError.value).toBeNull();
  auth.showFormError({ statusCode: 403, data: "Not allowed" }, "permission");
  expect(auth.formError.value).toEqual({
    title: "permission",
    description: "Not allowed",
  });
});

it("keeps consumed response identity app-local and out of transferred state", () => {
  const first = application();
  const second = application();
  const refusal = readOnlyFailure();
  expect(first.consume(refusal)).toBe(true);
  expect(first.consume(refusal)).toBe(true);
  expect(second.consume(refusal)).toBe(true);
  expect(add).toHaveBeenCalledTimes(2);
  expect(first.runtime.transferredState.size).toBe(0);
  expect(second.runtime.transferredState.size).toBe(0);
  expect(first.consume(readOnlyFailure())).toBe(true);
  expect(add).toHaveBeenCalledTimes(3);
});

it("collapses concurrent refusals in the real toast queue and notifies again after dismissal", async () => {
  vi.stubGlobal("useToast", useToast);
  const { app, consume } = application();
  const otherConsumer = app.runWithContext(useReadOnlyRefusal);
  const toast = app.runWithContext(useToast);
  consume(readOnlyFailure());
  otherConsumer(readOnlyFailure());
  await nextTick();
  await nextTick();
  expect(toast.toasts.value).toHaveLength(1);
  expect(toast.toasts.value[0]?.title).toBe("error.read_only_demo");
  toast.clear();
  expect(toast.toasts.value).toHaveLength(0);
  consume(readOnlyFailure());
  await nextTick();
  expect(toast.toasts.value).toHaveLength(1);
});

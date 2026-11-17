/** @vitest-environment jsdom */
import { createApp, nextTick } from "vue";
import { useToast } from "@nuxt/ui/composables/useToast";
import { afterEach, expect, it, vi } from "vitest";
import * as engine from "#dms/frontend-module";
import { useApiErrorPresenter } from "../layers/dms-core/app/composables/useApiErrorPresenter";
import { requestRefusal } from "./helpers/api-error-runtime";

function application() {
  vi.stubEnv("SSR", false);
  const app = createApp({});
  const runtime = engine.createDmsFrontendRuntime();
  engine.provideDmsFrontendRuntime(app, runtime);
  vi.stubGlobal("useDmsState", engine.useDmsState);
  vi.stubGlobal("useToast", useToast);
  return { app, runtime, presenter: app.runWithContext(useApiErrorPresenter) };
}

afterEach(() => vi.unstubAllGlobals());

it("keeps Response claims app-local and out of transferred state", async () => {
  const first = application();
  const second = application();
  const error = requestRefusal();
  const options = { fallbackKey: "error.500.description" };
  const toast = first.app.runWithContext(useToast);
  toast.clear();
  first.presenter.presentError(error, options);
  first.presenter.presentError(error, options);
  second.presenter.presentError(error, options);
  await nextTick();
  await nextTick();
  expect(toast.toasts.value).toHaveLength(2);
  expect(first.runtime.transferredState.size).toBe(0);
  expect(second.runtime.transferredState.size).toBe(0);
  first.presenter.presentError(requestRefusal(), options);
  await nextTick();
  expect(toast.toasts.value).toHaveLength(3);
  toast.clear();
});

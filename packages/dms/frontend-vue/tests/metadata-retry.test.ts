// @vitest-environment jsdom
import {
  type App,
  type Component,
  computed,
  createApp,
  type FunctionalComponent,
  h,
  inject,
  onBeforeUnmount,
  onScopeDispose,
  ref,
  useId,
  watch,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import File from "../layers/dms-ui/app/components/form/components/File.vue";
import Image from "../layers/dms-ui/app/components/form/components/Image.vue";
import {
  isDefinitiveMetadataFailure,
  resolveMetadataRetryDelay,
} from "../layers/dms-ui/app/utils/metadataRetry";

const authFetch = vi.fn();
const LONG_WAIT_MS = 120000;

interface FieldCase {
  name: string;
  component: Component;
  modelValue: unknown;
  unavailableLabel: string;
  metadata: Record<string, unknown>;
}

const FIELD_CASES: FieldCase[] = [
  {
    name: "File",
    component: File,
    modelValue: "files/profile/avatar.pdf",
    unavailableLabel: "dms.form.file.file_unavailable",
    metadata: {
      resourceKey: "files/profile/avatar.pdf",
      filename: "avatar.pdf",
      size: 2048,
      mimetype: "application/pdf",
      url: "https://example.test/avatar.pdf",
    },
  },
  {
    name: "Image",
    component: Image,
    modelValue: { key: "files/profile/cover.png", alt: "Cover" },
    unavailableLabel: "dms.form.image.file_unavailable",
    metadata: {
      resourceKey: "files/profile/cover.png",
      filename: "cover.png",
      size: 2048,
      mimetype: "image/png",
      url: "https://example.test/cover.png",
    },
  },
];

const passthrough: FunctionalComponent = (_, { slots }) =>
  h("span", slots.default?.());

const renderTag =
  (tag: string): FunctionalComponent =>
  () =>
    h(tag);

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    statusCode: status,
  });
}

function mountField(field: FieldCase): { app: App; container: HTMLElement } {
  const app = createApp({
    render: () => h(field.component, { modelValue: field.modelValue }),
  });
  app.config.globalProperties.$t = (key: string) => key;
  for (const name of ["UFileUpload", "ULink", "UTooltip"])
    app.component(name, passthrough);
  app.component("UButton", renderTag("button"));
  app.component("UIcon", renderTag("i"));
  app.component("UInput", renderTag("input"));
  app.component("UModal", () => null);
  const container = document.createElement("div");
  app.mount(container);
  return { app, container };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("useId", useId);
  vi.stubGlobal("onBeforeUnmount", onBeforeUnmount);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("FORM_FIELD_LOADING_KEY", Symbol());
  vi.stubGlobal("FORM_CONTENT_LANGUAGE_KEY", Symbol());
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useUploadWithProgress", () => ({
    uploadWithProgress: vi.fn(),
  }));
  // Outside a UFormField: no error, no aria attributes.
  vi.stubGlobal("useFormField", () => ({
    emitFormChange: vi.fn(),
    color: ref(undefined),
    highlight: ref(undefined),
    ariaAttrs: ref(undefined),
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal(
    "useDmsCookie",
    (_key: string, options: { default: () => unknown }) =>
      ref(options.default()),
  );
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe.each(FIELD_CASES)("$name stored-value metadata", (field) => {
  it.each([403, 404, 410])(
    "reads a file answered with %i exactly once and shows it unavailable",
    async (status) => {
      authFetch.mockRejectedValue(httpError(status));
      const { app, container } = mountField(field);

      await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

      expect(authFetch).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain(field.unavailableLabel);
      app.unmount();
    },
  );

  it("retries transient failures with a growing delay until the read succeeds", async () => {
    authFetch
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce(field.metadata);
    const { app, container } = mountField(field);
    await vi.advanceTimersByTimeAsync(0);
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(field.unavailableLabel);

    await vi.advanceTimersByTimeAsync(1000);
    expect(authFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(authFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(authFetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(authFetch).toHaveBeenCalledTimes(4);

    expect(container.textContent).not.toContain(field.unavailableLabel);
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);
    expect(authFetch).toHaveBeenCalledTimes(4);
    app.unmount();
  });
});

describe("metadata retry policy", () => {
  it("treats refusals and missing files as definitive", () => {
    for (const status of [400, 401, 403, 404, 410])
      expect(isDefinitiveMetadataFailure(httpError(status))).toBe(true);
    for (const error of [
      httpError(408),
      httpError(429),
      httpError(500),
      httpError(503),
      new Error("network down"),
      undefined,
    ])
      expect(isDefinitiveMetadataFailure(error)).toBe(false);
  });

  it("backs off exponentially up to a cap and never retries a definitive failure", () => {
    const transient = httpError(503);
    expect(resolveMetadataRetryDelay(transient, 1)).toBe(1000);
    expect(resolveMetadataRetryDelay(transient, 2)).toBe(2000);
    expect(resolveMetadataRetryDelay(transient, 3)).toBe(4000);
    expect(resolveMetadataRetryDelay(transient, 50)).toBe(30000);
    expect(resolveMetadataRetryDelay(httpError(404), 1)).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { createI18n } from "vue-i18n";
import { $fetch } from "#dms/frontend-module";
import { useApiErrorPresenter } from "../layers/dms-core/app/composables/useApiErrorPresenter";

const add = vi.fn(() => ({ id: "failure" }));
const update = vi.fn();
const remove = vi.fn();
const messages = {
  en: {
    error: {
      read_only_demo: "Read-only demo",
      "500": { description: "Try again" },
    },
    caller: "Could not save",
    equal: "equal",
    limit: "At most {max}",
  },
  fr: { caller: "Échec", error: { read_only_demo: "Démo en lecture seule" } },
};

function install() {
  vi.stubEnv("SSR", false);
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    messages,
  });
  const ledger = ref(new WeakMap());
  vi.stubGlobal("useDmsState", () => ledger);
  vi.stubGlobal("getPluginI18n", () => ({ i18n: i18n.global }));
  vi.stubGlobal("useToast", () => ({ add, update, remove }));
  vi.stubGlobal("window", {});
  return i18n.global;
}

function refusal(data: unknown, status = 403) {
  return { response: new Response(null, { status }), data };
}

describe("API error presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    install();
  });

  it("shows a translated JSON reason and severity once across captures and cause wrappers", () => {
    const error = refusal({
      message: "error.read_only_demo",
      severity: "warning",
    });
    const first = useApiErrorPresenter();
    const second = useApiErrorPresenter();
    first.presentError(error, { fallbackKey: "caller" });
    second.presentError(new Error("wrapper", { cause: { ...error } }), {
      fallbackKey: "caller",
    });
    second.presentError(reactive({ ...error }), { fallbackKey: "caller" });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Read-only demo", color: "warning" }),
    );
    expect(second.resolveError(error, { fallbackKey: "caller" })).toEqual({
      message: "Read-only demo",
      severity: "warning",
    });
  });

  it("does not merge distinct responses or suppress an unmarked 403", () => {
    const { presentError } = useApiErrorPresenter();
    presentError(refusal("untranslated.server.key"), { fallbackKey: "caller" });
    presentError(refusal("untranslated.server.key"), { fallbackKey: "caller" });
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Could not save", color: "warning" }),
    );
  });

  it("accepts plain assert keys and valid severity independently of message availability", () => {
    const { resolveError } = useApiErrorPresenter();
    expect(
      resolveError(refusal("$error.read_only_demo", 409), {
        fallbackKey: "caller",
      }),
    ).toEqual({ message: "Read-only demo", severity: "warning" });
    expect(
      resolveError(refusal({ message: "unknown", severity: "info" }, 500), {
        fallbackKey: "caller",
      }),
    ).toEqual({ message: "Could not save", severity: "info" });
    expect(
      resolveError(refusal({ message: "equal", severity: "error" }, 400), {
        fallbackKey: "caller",
      }),
    ).toEqual({ message: "equal", severity: "error" });
    expect(
      resolveError(refusal({ message: "equal", severity: "bad" }, 400), {
        fallbackKey: "caller",
      })?.severity,
    ).toBe("warning");
  });

  it("never displays serialized export envelopes or technical prose", () => {
    const { resolveError } = useApiErrorPresenter();
    const envelope = JSON.stringify({
      status: 500,
      body: "Failed to upload export: HTTP 403",
    });
    expect(
      resolveError(new Error(envelope), { fallbackKey: "caller" }),
    ).toEqual({ message: "Could not save", severity: "error" });
    expect(
      resolveError(
        new Error(
          JSON.stringify({
            status: 500,
            body: { status: 403, body: "error.read_only_demo" },
          }),
        ),
        { fallbackKey: "caller" },
      ),
    ).toEqual({ message: "Read-only demo", severity: "error" });
    expect(
      resolveError(new Error("raw prose"), { fallbackKey: "missing" })?.message,
    ).toBe("Try again");
    let nested: unknown = "error.read_only_demo";
    for (let depth = 0; depth < 10; depth++)
      nested = { status: 500, body: nested };
    expect(
      resolveError(new Error(JSON.stringify(nested)), { fallbackKey: "caller" })
        ?.message,
    ).toBe("Could not save");
  });

  it("silences aborts but not timeouts, network failures, or real failed responses", () => {
    const { presentError, resolveError } = useApiErrorPresenter();
    presentError(
      new Error("fetch", {
        cause: new DOMException("cancelled", "AbortError"),
      }),
      { fallbackKey: "caller", replaceToastId: "progress" },
    );
    expect(add).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("progress");
    expect(
      resolveError(new DOMException("timeout", "TimeoutError"), {
        fallbackKey: "caller",
      })?.severity,
    ).toBe("error");
    expect(
      resolveError(new TypeError("network"), { fallbackKey: "caller" })
        ?.message,
    ).toBe("Could not save");
    expect(
      resolveError(
        { name: "AbortError", statusCode: 403 },
        {
          fallbackKey: "caller",
        },
      ),
    ).toBeNull();
    expect(
      resolveError(
        { ...refusal("unknown"), name: "AbortError" },
        { fallbackKey: "caller" },
      )?.severity,
    ).toBe("warning");
  });

  it("uses live locale, fallback locale and interpolation without claiming inline resolution", () => {
    const composer = install();
    const { resolveError, presentError } = useApiErrorPresenter();
    const error = refusal("error.read_only_demo");
    expect(resolveError(error, { fallbackKey: "caller" })?.message).toBe(
      "Read-only demo",
    );
    composer.locale.value = "fr";
    expect(resolveError(error, { fallbackKey: "caller" })?.message).toBe(
      "Démo en lecture seule",
    );
    expect(
      resolveError(new Error("limit"), {
        fallbackKey: "caller",
        params: { max: 7 },
      })?.message,
    ).toBe("At most 7");
    expect(
      resolveError(new Error("wrapper", { cause: "error.read_only_demo" }), {
        fallbackKey: "caller",
      })?.message,
    ).toBe("Démo en lecture seule");
    presentError(error, { fallbackKey: "caller" });
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("settles progress without removing its own failure on repeated catches", () => {
    const { presentError } = useApiErrorPresenter();
    const error = refusal("error.read_only_demo");
    const options = { fallbackKey: "caller", replaceToastId: "progress" };
    presentError(error, options);
    presentError(error, options);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      "progress",
      expect.objectContaining({
        title: "Read-only demo",
        description: undefined,
        color: "warning",
      }),
    );
    expect(remove).not.toHaveBeenCalled();
    presentError(error, { ...options, replaceToastId: "stale" });
    expect(remove).toHaveBeenCalledWith("stale");
  });

  it.each([
    [
      403,
      { message: "error.read_only_demo", severity: "warning" },
      "Read-only demo",
      "warning",
    ],
    [409, "error.read_only_demo", "Read-only demo", "warning"],
    [500, { message: "missing", severity: "info" }, "Could not save", "info"],
    [
      400,
      { message: "error.read_only_demo", severity: "error" },
      "Read-only demo",
      "error",
    ],
  ])(
    "presents the parsed body from real ofetch for HTTP %s",
    async (status, body, title, color) => {
      const response = new Response(
        typeof body === "string" ? body : JSON.stringify(body),
        {
          status: Number(status),
          headers: {
            "content-type":
              typeof body === "string" ? "text/plain" : "application/json",
          },
        },
      );
      vi.stubGlobal("fetch", async () => response);
      const error = await $fetch
        .raw("https://fixture.test/write", { retry: 0 })
        .catch((failure: unknown) => failure);
      const { presentError } = useApiErrorPresenter();
      presentError(error, { fallbackKey: "caller" });
      presentError(new Error("wrapper", { cause: error }), {
        fallbackKey: "caller",
      });
      expect(add).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ title, color }),
      );
    },
  );

  it("does not claim a response during SSR and rolls back a failed toast emission", () => {
    const presenter = useApiErrorPresenter();
    const error = refusal("error.read_only_demo");
    vi.stubEnv("SSR", true);
    presenter.presentError(error, { fallbackKey: "caller" });
    expect(add).not.toHaveBeenCalled();
    vi.stubEnv("SSR", false);
    add.mockImplementationOnce(() => {
      throw new Error("toast unavailable");
    });
    expect(() =>
      presenter.presentError(error, { fallbackKey: "caller" }),
    ).toThrow("toast unavailable");
    presenter.presentError(error, { fallbackKey: "caller" });
    expect(add).toHaveBeenCalledTimes(2);
  });
});

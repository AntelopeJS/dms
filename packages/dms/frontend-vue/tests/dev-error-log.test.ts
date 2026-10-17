/**
 * The renderer's error handler only keeps an error for the error page: in
 * development, the original error is logged first, with its stack, and the
 * renderer's handler still runs.
 */
import { createApp, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsAppContext } from "#dms/frontend-module";

vi.mock("#dms/frontend-module", () => ({
  defineDmsPlugin: (setup: unknown) => setup,
}));

const { default: devErrorLogPlugin } = await import(
  "../layers/dms-core/app/plugins/dev-error-log"
);

let app: App;
let showErrorPage: ReturnType<typeof vi.fn>;

const install = () =>
  devErrorLogPlugin({ vueApp: app } as unknown as DmsAppContext);

beforeEach(() => {
  app = createApp({ render: () => null });
  showErrorPage = vi.fn();
  app.config.errorHandler = showErrorPage;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("dev error log", () => {
  it("logs the original error before the error page takes it", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    install();
    const error = new Error("Must be called at the top of a `setup` function");
    app.config.errorHandler!(error, null, "component update");
    expect(log).toHaveBeenCalledWith(
      "[dms] Uncaught error (component update)",
      error,
    );
    expect(showErrorPage).toHaveBeenCalledWith(error, null, "component update");
  });

  it("leaves the handler as it is outside development", () => {
    vi.stubEnv("DEV", false);
    install();
    expect(app.config.errorHandler).toBe(showErrorPage);
  });
});

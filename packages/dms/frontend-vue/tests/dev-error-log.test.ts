/** @vitest-environment jsdom */
/**
 * The renderer's error handler only keeps an error for the error page: in
 * development, the original error is logged first, with its stack, and the
 * renderer's handler still runs.
 */
import { createApp, defineComponent, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = await import("#dms/frontend-module");
const { default: devErrorLogPlugin } = await import(
  "../layers/dms-core/app/plugins/dev-error-log"
);

let app: App;
let showErrorPage: ReturnType<typeof vi.fn>;

const install = () =>
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Only vueApp is consumed by the error-handler plugin; the fixture deliberately omits unrelated app-context services.
  devErrorLogPlugin({ vueApp: app } as never);

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

  it("logs an error a page throws once the runtime installed it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await engine.setupFrontendModules([
      {
        options: { public: {} },
        module: {
          setup(sdk) {
            sdk.registerPlugin(devErrorLogPlugin, {
              clientOnly: true,
              enforce: "pre",
            });
          },
        },
      },
    ]);
    const error = new Error("render failed");
    const Page = defineComponent({
      setup: () => () => {
        throw error;
      },
    });
    const runtime = engine.createDmsFrontendRuntime(undefined, {});
    const page = createApp(Page);
    engine.provideDmsFrontendRuntime(page, runtime);
    await engine.installDmsPlugins(
      page,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This no-translation fixture supplies only the locale and message setter used during plugin installation.
      { locale: { value: "en" }, setLocaleMessage() {} } as never,
      runtime,
      async () => ({}),
      ["en"],
    );
    page.mount(document.createElement("div"));

    expect(log).toHaveBeenCalledWith(
      "[dms] Uncaught error (render function)",
      error,
    );
    expect(runtime.currentError.value).toBe(error);
    page.unmount();
  });
});

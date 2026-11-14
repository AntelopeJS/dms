// @vitest-environment jsdom
import * as vue from "vue";
import { computed, createApp } from "vue";
import { createI18n } from "vue-i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DmsAppContext,
  DmsFrontendModule,
  DmsFrontendSdk,
  DmsPluginSetup,
} from "#dms/frontend-module";

async function clientPlugins(): Promise<DmsPluginSetup[]> {
  const engine = await import("#dms/frontend-module");
  Object.entries({ ...vue, ...engine }).forEach(([name, value]) => {
    vi.stubGlobal(name, value);
  });
  const { default: frontendModule } = await import("../dms.frontend");
  const registered: DmsPluginSetup[] = [];
  const probe: DmsFrontendModule = {
    setup(sdk: DmsFrontendSdk) {
      frontendModule.setup({
        ...sdk,
        registerPlugin: (setup, options) => {
          if (options?.clientOnly) registered.push(setup);
        },
      });
    },
  };
  await engine.setupFrontendModules([
    { module: probe, options: { public: {} } },
  ]);
  return registered;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the dev-only plugins of the dms frontend module", () => {
  it("run through the app context once their file has loaded", async () => {
    const app = createApp({});
    let contextRuns = 0;
    const context: DmsAppContext = {
      vueApp: app,
      provide: () => undefined,
      runWithContext: (callback) => {
        contextRuns += 1;
        return app.runWithContext(callback);
      },
      hook: () => undefined,
      $i18n: Object.assign(createI18n({ legacy: false }).global, {
        locales: computed(() => []),
        setLocale: async () => undefined,
      }),
    };

    const [devReload, devErrorLog] = await clientPlugins();
    for (const setup of [devReload, devErrorLog])
      await Promise.resolve(setup(context)).catch(() => undefined);

    expect(contextRuns).toBe(2);
  });
});

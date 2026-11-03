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
  await engine.setupFrontendModules([{ module: probe, options: {} }]);
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
    const runWithContext = vi.fn(
      <T>(callback: () => T): T => app.runWithContext(callback),
    );
    const context: DmsAppContext = {
      vueApp: app,
      provide: () => undefined,
      runWithContext,
      hook: () => undefined,
      $i18n: Object.assign(createI18n({ legacy: false }).global, {
        locales: computed(() => []),
        setLocale: async () => undefined,
      }),
    };

    const [devReload, devErrorLog] = await clientPlugins();
    for (const setup of [devReload, devErrorLog])
      await Promise.resolve(setup(context)).catch(() => undefined);

    expect(runWithContext).toHaveBeenCalledTimes(2);
  });
});

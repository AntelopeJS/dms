import * as vue from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DmsFrontendModule, DmsFrontendSdk } from "#dms/frontend-module";
import { dmsComponentNames } from "../scripts/check-dms-components.mjs";

async function productionRegistrations(): Promise<Set<string>> {
  vi.stubEnv("DEV", false);
  const engine = await import("#dms/frontend-module");
  Object.entries({ ...vue, ...engine }).forEach(([name, value]) => {
    vi.stubGlobal(name, value);
  });
  const { default: frontendModule } = await import("../dms.frontend");
  const names = new Set<string>();
  const register = (name: string) => names.add(`Dms${name}`);
  const probe: DmsFrontendModule = {
    setup(sdk: DmsFrontendSdk) {
      frontendModule.setup({
        ...sdk,
        registerPlugin: () => undefined,
        registerComponent: register,
        registerLayout: register,
      });
    },
  };
  await engine.setupFrontendModules([
    { module: probe, options: { public: {} } },
  ]);
  return names;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the DMS component check", () => {
  it("knows exactly the components and layouts dms.frontend.ts registers in production", async () => {
    expect(dmsComponentNames()).toEqual(await productionRegistrations());
  });
});

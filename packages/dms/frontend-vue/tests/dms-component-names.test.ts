import * as vue from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DmsFrontendModule, DmsFrontendSdk } from "#dms/frontend-module";
import { dmsRegistrations } from "../scripts/check-dms-components.mjs";

async function productionRegistrations(): Promise<{
  components: Set<string>;
  layouts: Set<string>;
}> {
  vi.stubEnv("DEV", false);
  const engine = await import("#dms/frontend-module");
  Object.entries({ ...vue, ...engine }).forEach(([name, value]) => {
    vi.stubGlobal(name, value);
  });
  const { default: frontendModule } = await import("../dms.frontend");
  const components = new Set<string>();
  const layouts = new Set<string>();
  const probe: DmsFrontendModule = {
    async setup(sdk: DmsFrontendSdk) {
      await frontendModule.setup({
        ...sdk,
        registerPlugin: () => undefined,
        registerComponent: (name) => components.add(`Dms${name}`),
        registerLayout: (name) => layouts.add(name),
      });
    },
  };
  await engine.setupFrontendModules([
    { module: probe, options: { public: {} } },
  ]);
  return { components, layouts };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the DMS component check", () => {
  it("knows exactly the components and layouts dms.frontend.ts registers in production", async () => {
    expect(dmsRegistrations()).toEqual(await productionRegistrations());
  }, 20000);
});

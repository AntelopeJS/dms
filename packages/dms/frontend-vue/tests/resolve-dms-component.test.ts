import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  resolveDmsComponent: vi.fn(),
}));

vi.mock("#dms/frontend-module", () => engine);

const PAGE_MODULE = "@antelopejs/dms-frontend-vue";
const PrivateSection = { name: "SecurityStatus" };

describe("resolveDmsComponent", () => {
  const states = new Map<string, ReturnType<typeof ref>>();

  beforeEach(() => {
    states.clear();
    vi.stubGlobal("useDmsState", <T>(key: string, init?: () => T) => {
      if (!states.has(key)) states.set(key, ref(init?.()));
      return states.get(key);
    });
    engine.resolveDmsComponent.mockImplementation(
      (name: string, owner?: string) =>
        name === "DmsSecurityStatus" && owner === PAGE_MODULE
          ? PrivateSection
          : undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    engine.resolveDmsComponent.mockReset();
  });

  async function load() {
    const [{ resolveDmsComponent }, { usePageModule }] = await Promise.all([
      import("../layers/dms-ui/app/composables/resolveDmsComponent"),
      import("../layers/dms-ui/app/build/composables/page/pageModule"),
    ]);
    return { resolveDmsComponent, usePageModule };
  }

  it("resolves a private component in a page of the module owning it", async () => {
    const { resolveDmsComponent, usePageModule } = await load();
    usePageModule().value = PAGE_MODULE;

    expect(resolveDmsComponent("DmsSecurityStatus")).toBe(PrivateSection);
    expect(engine.resolveDmsComponent).toHaveBeenCalledWith(
      "DmsSecurityStatus",
      PAGE_MODULE,
    );
  });

  it("does not resolve it in a page another module owns", async () => {
    const { resolveDmsComponent, usePageModule } = await load();
    usePageModule().value = "@acme/billing-frontend";

    expect(resolveDmsComponent("DmsSecurityStatus")).toBeUndefined();
  });

  it("does not resolve it outside a page naming its module", async () => {
    const { resolveDmsComponent } = await load();

    expect(resolveDmsComponent("DmsSecurityStatus")).toBeUndefined();
    expect(engine.resolveDmsComponent).toHaveBeenCalledWith(
      "DmsSecurityStatus",
      undefined,
    );
  });
});

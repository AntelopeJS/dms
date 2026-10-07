import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  resolveDmsComponent: vi.fn(),
}));

vi.mock("#dms/frontend-module", () => engine);

const SecurityStatus = { name: "SecurityStatus" };

describe("resolveDmsComponent", () => {
  beforeEach(() => {
    engine.resolveDmsComponent.mockImplementation((name: string) =>
      name === "DmsSecurityStatus" ? SecurityStatus : undefined,
    );
  });

  afterEach(() => {
    engine.resolveDmsComponent.mockReset();
  });

  async function load() {
    return import("../layers/dms-ui/app/composables/resolveDmsComponent");
  }

  it("resolves a component through the engine by its full name", async () => {
    const { resolveDmsComponent } = await load();

    expect(resolveDmsComponent("DmsSecurityStatus")).toBe(SecurityStatus);
    expect(engine.resolveDmsComponent).toHaveBeenCalledWith(
      "DmsSecurityStatus",
    );
  });

  it("resolves nothing for a name the engine does not know", async () => {
    const { resolveDmsComponent } = await load();

    expect(resolveDmsComponent("SecurityStatus")).toBeUndefined();
  });

  it("resolves nothing without a name", async () => {
    const { resolveDmsComponent } = await load();

    expect(resolveDmsComponent(undefined)).toBeUndefined();
    expect(engine.resolveDmsComponent).not.toHaveBeenCalled();
  });
});

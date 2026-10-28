import { describe, expect, it } from "vitest";
import { registerDmsComponent } from "#dms/frontend-module";
import { resolveDmsComponent } from "../layers/dms-ui/app/composables/resolveDmsComponent";

const SecurityStatus = { name: "SecurityStatus" };
registerDmsComponent("DmsSecurityStatus", SecurityStatus);

describe("resolveDmsComponent", () => {
  it("resolves a component through the engine by its full name", () => {
    expect(resolveDmsComponent("DmsSecurityStatus")).toBe(SecurityStatus);
  });

  it("resolves nothing for a name the engine does not know", () => {
    expect(resolveDmsComponent("SecurityStatus")).toBeUndefined();
  });

  it("resolves nothing without a name", () => {
    expect(resolveDmsComponent(undefined)).toBeUndefined();
  });
});

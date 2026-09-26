import { GetResponsibleModule } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  RegisterSaasMode,
  internal as saasModeInternal,
  isSaasMode,
} from "@antelopejs/interface-dms/utils/saas-mode";

const EXPLICIT_REGISTRATION = { id: "saas-mode-test-registration" };

// A registration belongs to the module that made it: here, the test module.
function unloadRegisteringModule(): void {
  const moduleId = GetResponsibleModule();
  if (!moduleId) throw new Error("No responsible module for the test");
  saasModeInternal.RegisterSaasMode.unregisterModule(moduleId);
}

describe("[unit] SaaS mode registration", () => {
  afterEach(() => {
    unloadRegisteringModule();
  });

  it("is off while no module has registered it", async () => {
    expect(await isSaasMode()).to.equal(false);
  });

  it("is on once a module registers it", async () => {
    RegisterSaasMode();
    expect(await isSaasMode()).to.equal(true);
  });

  it("turns off when the registration is revoked", async () => {
    saasModeInternal.RegisterSaasMode.register(EXPLICIT_REGISTRATION);
    expect(await isSaasMode()).to.equal(true);
    saasModeInternal.RegisterSaasMode.unregister(EXPLICIT_REGISTRATION);
    expect(await isSaasMode()).to.equal(false);
  });

  it("turns off when the registering module unloads", async () => {
    RegisterSaasMode();
    unloadRegisteringModule();
    expect(await isSaasMode()).to.equal(false);
  });

  it("stays on while another registration is still active", async () => {
    RegisterSaasMode();
    saasModeInternal.RegisterSaasMode.register(EXPLICIT_REGISTRATION);
    saasModeInternal.RegisterSaasMode.unregister(EXPLICIT_REGISTRATION);
    expect(await isSaasMode()).to.equal(true);
  });
});

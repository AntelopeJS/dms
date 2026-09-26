import { HTTPResult } from "@antelopejs/interface-api";
import { GetResponsibleModule } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type { TenantMember } from "@antelopejs/interface-dms/db";
import { syncPlatformOwnerOnTenantOwnerChange } from "@antelopejs/interface-dms/tenant-ownership";
import {
  RegisterSaasMode,
  internal as saasModeInternal,
} from "@antelopejs/interface-dms/utils/saas-mode";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { assertNotLastPlatformOwnerOnDelete } from "../../pages/settings/users/members";
import { resetDatabase } from "../helpers/db";

const USER_ID = "saas-mode-user";
const HTTP_CONFLICT = 409;

async function insertUser(owner: boolean): Promise<void> {
  await GetModel(UserModel).insert({
    _id: USER_ID,
    email: `${USER_ID}@test.local`,
    name: USER_ID,
    authKey: "saas-mode-key",
    isValidated: true,
    language: "en",
    password: null,
    owner,
  });
}

async function isPlatformOwner(): Promise<boolean | undefined> {
  return (await GetModel(UserModel).get(USER_ID))?.owner;
}

async function promoteInDefaultTenant(): Promise<void> {
  await syncPlatformOwnerOnTenantOwnerChange(
    GetModel(UserModel),
    USER_ID,
    DEFAULT_TENANT_ID,
    true,
  );
}

function removeLastOwner(): Promise<void> {
  const target = { userId: USER_ID, isTenantOwner: true } as TenantMember;
  return assertNotLastPlatformOwnerOnDelete([target]);
}

// A registration belongs to the module that made it: here, the test module.
function unloadRegisteringModule(): void {
  const moduleId = GetResponsibleModule();
  if (!moduleId) throw new Error("No responsible module for the test");
  saasModeInternal.RegisterSaasMode.unregisterModule(moduleId);
}

describe("Platform ownership in and out of SaaS mode", () => {
  beforeEach(resetDatabase);
  afterEach(unloadRegisteringModule);

  it("mirrors the default tenant's owner flag into users.owner outside SaaS mode", async () => {
    await insertUser(false);
    await promoteInDefaultTenant();
    expect(await isPlatformOwner()).to.equal(true);
  });

  it("keeps users.owner independent from tenant ownership in SaaS mode", async () => {
    await insertUser(false);
    RegisterSaasMode();
    await promoteInDefaultTenant();
    expect(await isPlatformOwner()).to.equal(false);
  });

  it("refuses to remove the last platform owner outside SaaS mode", async () => {
    await insertUser(true);
    try {
      await removeLastOwner();
      expect.fail("Expected the last platform owner guard to reject");
    } catch (error) {
      expect(error).to.be.instanceOf(HTTPResult);
      expect((error as HTTPResult).getStatus()).to.equal(HTTP_CONFLICT);
    }
  });

  it("lets the last tenant owner go in SaaS mode", async () => {
    await insertUser(true);
    RegisterSaasMode();
    await removeLastOwner();
  });

  it("goes back to mirroring once the SaaS module unloads", async () => {
    await insertUser(false);
    RegisterSaasMode();
    unloadRegisteringModule();
    await promoteInDefaultTenant();
    expect(await isPlatformOwner()).to.equal(true);
  });
});

import { Schema } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_NAME,
} from "@antelopejs/interface-dms/constants";
import { RoleModel, TenantModel } from "@antelopejs/interface-dms/db";
import {
  Hook,
  type HookHandler,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { ProvisionTenant } from "@antelopejs/interface-dms/tenant-provisioning";
import { expect } from "chai";
import {
  registerExistingTenantInstances,
  registerTenantInstance,
} from "../../../utils/tenant-instances";
import { resetDatabase } from "../../helpers/db";
import { reloadHostProvisionedTenants } from "../../helpers/reload-host";

const EXISTING_TENANT = "instances-existing-tenant";
const PROVISIONED_TENANT = "instances-provisioned-tenant";
const ROLE_ID = "instances-role";
const PROVISIONING_USER = "instances-user";

async function listTenantInstances(): Promise<string[]> {
  const schema = Schema.get(TENANT_SCHEMA_NAME);
  if (!schema) throw new Error(`Schema '${TENANT_SCHEMA_NAME}' is missing`);
  return schema.listInstances();
}

describe("[unit] utils/tenant-instances", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lists the default tenant's instance once the DMS has started", async () => {
    expect(await listTenantInstances()).to.include(DEFAULT_TENANT_ID);
  });

  it("registers the instance of a tenant that existed without one", async () => {
    await GetModel(TenantModel).table.insert({ _id: EXISTING_TENANT }).run();

    await registerExistingTenantInstances();

    expect(await listTenantInstances()).to.include(EXISTING_TENANT);
  });

  it("re-registers an instance without touching its data", async () => {
    await GetModel(TenantModel).table.insert({ _id: EXISTING_TENANT }).run();
    await registerTenantInstance(EXISTING_TENANT);
    const roles = GetModel(RoleModel, EXISTING_TENANT);
    await roles.table.insert({ _id: ROLE_ID, name: "Editor" }).run();

    await registerTenantInstance(EXISTING_TENANT);
    await registerExistingTenantInstances();

    const instances = await listTenantInstances();
    expect(instances.filter((id) => id === EXISTING_TENANT)).to.have.length(1);
    expect(await roles.table.count().run()).to.equal(1);
  });

  it("registers the instance of a tenant being provisioned before any handler runs", async () => {
    let listedByHandler: string[] = [];
    const handler: HookHandler<Hook.TENANT_BEING_PROVISIONED> = async () => {
      listedByHandler = await listTenantInstances();
      return undefined;
    };
    RegisterHook(Hook.TENANT_BEING_PROVISIONED, handler);
    try {
      await ProvisionTenant({
        tenantId: PROVISIONED_TENANT,
        userId: PROVISIONING_USER,
        extras: {},
      });
    } finally {
      UnregisterHook(Hook.TENANT_BEING_PROVISIONED, handler);
    }

    expect(listedByHandler).to.include(PROVISIONED_TENANT);
  });

  it("provisions the default tenant once, after DATABASE_INITIALIZED", () => {
    const defaults = reloadHostProvisionedTenants().filter(
      (call) => call.tenantId === DEFAULT_TENANT_ID,
    );

    expect(defaults).to.have.length(1);
    expect(defaults[0].userId).to.equal(undefined);
    expect(defaults[0].afterDatabaseInitialized).to.equal(true);
  });
});

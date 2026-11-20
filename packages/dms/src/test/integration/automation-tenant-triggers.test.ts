import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel, TenantModel } from "@antelopejs/interface-dms/db";
import {
  ExecuteHooks,
  GetRegisteredHooks,
  Hook,
  type HookHandler,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { runTenantLifecycleOperation } from "@antelopejs/interface-dms/tenant-lifecycle";
import { ProvisionTenant } from "@antelopejs/interface-dms/tenant-provisioning";
import { expect } from "chai";
import { TRIGGERS } from "../../automation";
import { ensureDefaultTenantExists, provisionDefaultTenant } from "../../utils";
import { armTrigger } from "../helpers/automation-nodes";
import { resetDatabase } from "../helpers/db";

const NEW_TENANT = "automation-tenant-created";
const GONE_TENANT = "automation-tenant-deleted";
const OPERATION = "retention:automation-tenant-deleted";

describe("[integration] automation trigger dms.tenant-created", () => {
  beforeEach(resetDatabase);

  it("fires once with the name and the account a workspace is provisioned for", async () => {
    await GetModel(TenantModel)
      .table.insert({ _id: NEW_TENANT, name: "Acme" })
      .run();
    const armed = await armTrigger("dms.tenant-created");
    try {
      await ProvisionTenant({
        tenantId: NEW_TENANT,
        userId: "founder",
        extras: { plan: "pro" },
      });
    } finally {
      await armed.disarm();
    }
    expect(armed.events).to.have.length(1);
    expect(armed.events[0]).to.deep.include({
      tenantId: NEW_TENANT,
      name: "Acme",
      userId: "founder",
      isDefault: false,
      deliveryId: `tenant-created:${NEW_TENANT}`,
    });
    expect(armed.events[0]).to.not.have.property("extras");
  });

  it("fires for the default tenant without a user", async () => {
    await ensureDefaultTenantExists();
    const armed = await armTrigger("dms.tenant-created");
    try {
      await provisionDefaultTenant();
    } finally {
      await armed.disarm();
    }
    expect(armed.events).to.have.length(1);
    expect(armed.events[0]).to.deep.include({
      tenantId: DEFAULT_TENANT_ID,
      isDefault: true,
    });
    expect(armed.events[0]).to.not.have.property("userId");
  });

  it("still fires without a tenant row, and a throwing listener does not unwind provisioning", async () => {
    const trigger = TRIGGERS.find(
      (candidate) => candidate.id === "dms.tenant-created",
    );
    const handle = await trigger?.activate(undefined, () => {
      throw new Error("listener failed");
    });
    const listening = await armTrigger("dms.tenant-created");
    try {
      await ProvisionTenant({ tenantId: NEW_TENANT, extras: {} });
    } finally {
      await listening.disarm();
      if (handle) await trigger?.deactivate(handle);
    }
    expect(listening.events).to.have.length(1);
    expect(listening.events[0]).to.not.have.property("name");
  });

  it("has fired before a provisioning handler registered later refuses the workspace", async () => {
    const refuse: HookHandler<Hook.TENANT_BEING_PROVISIONED> = () => {
      throw new Error("refused");
    };
    RegisterHook(Hook.TENANT_BEING_PROVISIONED, refuse);
    const armed = await armTrigger("dms.tenant-created");
    try {
      await ProvisionTenant({ tenantId: NEW_TENANT, extras: {} }).catch(
        () => undefined,
      );
    } finally {
      UnregisterHook(Hook.TENANT_BEING_PROVISIONED, refuse);
      await armed.disarm();
    }
    expect(armed.events).to.have.length(1);
  });

  it("registers its provisioning handler once, owned by the DMS module", () => {
    const [cleanup] = GetRegisteredHooks(Hook.TENANT_DELETED);
    const owned = GetRegisteredHooks(Hook.TENANT_BEING_PROVISIONED).filter(
      (entry) =>
        entry.moduleId !== undefined && entry.moduleId === cleanup?.moduleId,
    );
    expect(cleanup?.moduleId).to.be.a("string");
    expect(owned).to.have.length(1);
  });
});

describe("[integration] automation trigger dms.tenant-deleted", () => {
  beforeEach(async () => {
    await resetDatabase();
    await GetModel(TenantModel)
      .table.insert({ _id: GONE_TENANT, name: "Gone Inc" })
      .run();
    const [ownerId] = await GetModel(UserModel).insert({
      email: "first-owner@test.local",
      name: "First",
    });
    const members = GetModel(TenantMemberModel, GONE_TENANT);
    await members.table
      .insert([
        {
          userId: ownerId,
          roleIds: [],
          isTenantOwner: true,
          joinedAt: new Date(1_000),
        },
        {
          userId: "second-owner",
          roleIds: [],
          isTenantOwner: true,
          joinedAt: new Date(2_000),
        },
        {
          userId: "plain-member",
          roleIds: [],
          isTenantOwner: false,
          joinedAt: new Date(500),
        },
      ])
      .run();
  });

  it("fires after cleanup with the name and owners read before it, and the operation id", async () => {
    const armed = await armTrigger("dms.tenant-deleted");
    try {
      await ExecuteHooks(Hook.TENANT_DELETED, GONE_TENANT, {
        operationId: OPERATION,
      });
      expect(
        await GetModel(TenantMemberModel, GONE_TENANT).listAll(),
      ).to.deep.equal([]);
      await ExecuteHooks(Hook.TENANT_DELETED, GONE_TENANT, {
        operationId: OPERATION,
      });
    } finally {
      await armed.disarm();
    }
    const firstOwner = await GetModel(UserModel).getByEmail(
      "first-owner@test.local",
    );
    expect(armed.events).to.have.length(2);
    expect(armed.events[0]).to.deep.include({
      tenantId: GONE_TENANT,
      name: "Gone Inc",
      ownerUserId: firstOwner?._id,
      ownerUserIds: [firstOwner?._id, "second-owner"],
      ownerEmail: "first-owner@test.local",
      operationId: OPERATION,
      deliveryId: OPERATION,
    });
    expect(armed.events[1]).to.deep.include({
      ownerUserIds: [],
      deliveryId: OPERATION,
    });
    expect(armed.events[1]).to.not.have.property("ownerUserId");
  });

  it("uses a tenant-scoped delivery id when the emitter passes no context", async () => {
    const armed = await armTrigger("dms.tenant-deleted");
    try {
      await ExecuteHooks(Hook.TENANT_DELETED, GONE_TENANT);
    } finally {
      await armed.disarm();
    }
    expect(armed.events[0]).to.deep.include({
      deliveryId: `tenant-deleted:${GONE_TENANT}`,
    });
    expect(armed.events[0]).to.not.have.property("operationId");
  });

  it("fires nothing when cleanup fails, and the failure propagates", async () => {
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const paused = runTenantLifecycleOperation(GONE_TENANT, async () => {
      entered.resolve();
      await resume.promise;
    });
    await entered.promise;
    const armed = await armTrigger("dms.tenant-deleted");
    let refusal: unknown;
    try {
      await ExecuteHooks(Hook.TENANT_DELETED, GONE_TENANT, {
        operationId: OPERATION,
      }).catch((error: unknown) => {
        refusal = error;
      });
    } finally {
      resume.resolve();
      await paused;
      await armed.disarm();
    }
    expect(refusal).to.be.instanceOf(Error);
    expect(armed.events).to.deep.equal([]);
  });
});

import { HTTPResult } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import {
  GetModel,
  RegisterSchema,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  authorizeAction,
  GATE_BYPASSABLE_ACTIONS,
} from "@antelopejs/interface-dms/base/table-view/internal/auth";
import {
  TableViewMeta,
  type TableViewOptions,
  type TableViewOptionsSerialized,
} from "@antelopejs/interface-dms/base/table-view";
import { denyingTenantGate } from "../../../helpers/page-access";

const DENIED_TENANT = "tv-gate-denied-tenant";
const ALLOWED_TENANT = "tv-gate-allowed-tenant";
const SUSPENDED_CODE = "tv-gate.suspended";
const LIST_ACTION = "list";
const READ_ACTIONS = ["view", "list", "select"];

const WRITE_ACTIONS = ["add", "edit", "delete", "archive", "restore", "export"];
const PERMISSION_ID = "tv-gate.invoices";
const HTTP_FORBIDDEN = 403;
// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Authorization needs only the id; this fixture intentionally omits unrelated user columns.
const MEMBER = { _id: "tv-gate-member" } as User;

const gateInfo = denyingTenantGate("tv-gate", DENIED_TENANT, SUSPENDED_CODE);

function tableViewInstance(options: TableViewOptions, permissionId?: string) {
  class Controller {}
  const meta = GetMetadata(Controller, TableViewMeta);
  meta.setOptions(options);
  if (options.bypassTenantAccessGate) {
    meta.setBypassTenantAccessGate();
  }
  if (permissionId) {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Authorization calls only getAction on this deliberately partial builder; constructing a real builder would register unrelated components.
    meta.addComponentBuilder({
      getAction: () => ({ permissionId }),
    } as unknown as ComponentBuilder<TableViewOptionsSerialized>);
  }
  return new Controller();
}

async function rejectionOf(promise: Promise<unknown>): Promise<HTTPResult> {
  try {
    await promise;
  } catch (error: PromiseRejectedResult["reason"]) {
    expect(error).to.be.instanceOf(HTTPResult);
    return error;
  }
  throw new Error("expected the action authorization to refuse");
}

describe("[unit] interfaces/dms-base/table-view — bypassTenantAccessGate", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);

    await RegisterSchema(TENANT_SCHEMA_NAME);

    tenantAccessInterface.RegisterTenantAccessGate(gateInfo);
  });

  after(() => {
    tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
      gateInfo,
    );
  });

  it("keeps refusing an unflagged table view while the gate denies the tenant", async () => {
    const error = await rejectionOf(
      authorizeAction(
        tableViewInstance({}),
        LIST_ACTION,
        MEMBER,
        DENIED_TENANT,
      ),
    );
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(error.getBody()).to.equal(SUSPENDED_CODE);
  });

  it("serves a flagged table view's stamped action while the gate denies the tenant", async () => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Authorization needs only the id, not a complete persisted user.
    const granted = { _id: "tv-gate-stamped-member" } as User;
    const [roleId] = await GetModel(RoleModel, DENIED_TENANT).insert({
      name: "tv-gate-stamped",
      permissions: [PERMISSION_ID],
    });
    await GetModel(TenantMemberModel, DENIED_TENANT).insert({
      userId: granted._id,
      roleIds: [roleId],
      isTenantOwner: false,
      invitedBy: null,
    });

    const permissions = await authorizeAction(
      tableViewInstance({ bypassTenantAccessGate: true }, PERMISSION_ID),
      LIST_ACTION,
      granted,
      DENIED_TENANT,
    );
    expect([...(permissions ?? [])]).to.include(PERMISSION_ID);
  });

  it("re-gates an unstamped action of a flagged table view", async () => {
    const error = await rejectionOf(
      authorizeAction(
        tableViewInstance({ bypassTenantAccessGate: true }),
        LIST_ACTION,
        MEMBER,
        DENIED_TENANT,
      ),
    );
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(error.getBody()).to.equal(SUSPENDED_CODE);
  });

  it("leaves an unstamped action of a flagged table view alone for an allowed tenant", async () => {
    expect(
      await authorizeAction(
        tableViewInstance({ bypassTenantAccessGate: true }),
        LIST_ACTION,
        MEMBER,
        ALLOWED_TENANT,
      ),
    ).to.equal(undefined);
  });

  for (const writeAction of WRITE_ACTIONS) {
    it(`re-gates the "${writeAction}" action of a flagged table view`, async () => {
      const error = await rejectionOf(
        authorizeAction(
          tableViewInstance({ bypassTenantAccessGate: true }, PERMISSION_ID),
          writeAction,
          MEMBER,
          DENIED_TENANT,
        ),
      );
      expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
      expect(error.getBody()).to.equal(SUSPENDED_CODE);
    });
  }

  for (const readAction of READ_ACTIONS) {
    it(`serves the "${readAction}" action of a flagged table view`, async () => {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Authorization needs only the id, not a complete persisted user.
      const granted = { _id: `tv-gate-${readAction}-member` } as User;
      const [roleId] = await GetModel(RoleModel, DENIED_TENANT).insert({
        name: `tv-gate-${readAction}`,
        permissions: [PERMISSION_ID],
      });
      await GetModel(TenantMemberModel, DENIED_TENANT).insert({
        userId: granted._id,
        roleIds: [roleId],
        isTenantOwner: false,
        invitedBy: null,
      });

      const permissions = await authorizeAction(
        tableViewInstance({ bypassTenantAccessGate: true }, PERMISSION_ID),
        readAction,
        granted,
        DENIED_TENANT,
      );
      expect([...(permissions ?? [])]).to.include(PERMISSION_ID);
    });
  }

  it("leaves the writes of a flagged table view alone for an allowed tenant", async () => {
    expect(
      await authorizeAction(
        tableViewInstance({ bypassTenantAccessGate: true }),
        "delete",
        MEMBER,
        ALLOWED_TENANT,
      ),
    ).to.equal(undefined);
  });

  it("still refuses a caller missing the action permission under bypass", async () => {
    const error = await rejectionOf(
      authorizeAction(
        tableViewInstance({ bypassTenantAccessGate: true }, PERMISSION_ID),
        LIST_ACTION,
        MEMBER,
        DENIED_TENANT,
      ),
    );
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(error.getBody()).to.equal(
      `Forbidden: missing permission ${PERMISSION_ID}`,
    );
  });

  it("grants a permitted caller its permission set under bypass", async () => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Authorization needs only the id, not a complete persisted user.
    const granted = { _id: "tv-gate-granted-member" } as User;
    const [roleId] = await GetModel(RoleModel, DENIED_TENANT).insert({
      name: "tv-gate-billing",
      permissions: [PERMISSION_ID],
    });
    await GetModel(TenantMemberModel, DENIED_TENANT).insert({
      userId: granted._id,
      roleIds: [roleId],
      isTenantOwner: false,
      invitedBy: null,
    });

    const permissions = await authorizeAction(
      tableViewInstance({ bypassTenantAccessGate: true }, PERMISSION_ID),
      LIST_ACTION,
      granted,
      DENIED_TENANT,
    );
    expect([...(permissions ?? [])]).to.include(PERMISSION_ID);
  });

  it("leaves an allowed tenant untouched on an unflagged table view", async () => {
    expect(
      await authorizeAction(
        tableViewInstance({}),
        LIST_ACTION,
        MEMBER,
        ALLOWED_TENANT,
      ),
    ).to.equal(undefined);
  });

  it("keeps the bypass when a later registration omits the flag", async () => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Authorization needs only the id, not a complete persisted user.
    const granted = { _id: "tv-gate-latch-member" } as User;
    const [roleId] = await GetModel(RoleModel, DENIED_TENANT).insert({
      name: "tv-gate-latch",
      permissions: [PERMISSION_ID],
    });
    await GetModel(TenantMemberModel, DENIED_TENANT).insert({
      userId: granted._id,
      roleIds: [roleId],
      isTenantOwner: false,
      invitedBy: null,
    });

    const instance = tableViewInstance(
      { bypassTenantAccessGate: true },
      PERMISSION_ID,
    );
    /* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- TypeScript types an instance's constructor as Function, losing the local Controller constructor signature needed by GetMetadata. */
    const meta = GetMetadata(
      (
        instance as {
          constructor: new () => ReturnType<typeof tableViewInstance>;
        }
      ).constructor,
      TableViewMeta,
    );
    /* oxlint-enable anti-slop/require-safety-comment-for-type-assertion */
    meta.setOptions({});

    const permissions = await authorizeAction(
      instance,
      LIST_ACTION,
      granted,
      DENIED_TENANT,
    );
    expect([...(permissions ?? [])]).to.include(PERMISSION_ID);
  });

  it("opens the gate to reads only", () => {
    expect([...GATE_BYPASSABLE_ACTIONS].sort()).to.deep.equal(
      [...READ_ACTIONS].sort(),
    );
    for (const writeAction of WRITE_ACTIONS) {
      expect(GATE_BYPASSABLE_ACTIONS).to.not.include(writeAction);
    }
  });

  it("reports a controller mounted both with and without the flag", () => {
    class Controller {}
    const meta = GetMetadata(Controller, TableViewMeta);

    meta.recordGateBypassRegistration(false);
    expect(meta.hasMixedGateBypassRegistrations).to.equal(false);
    meta.recordGateBypassRegistration(true);

    expect(meta.hasMixedGateBypassRegistrations).to.equal(true);
  });
});

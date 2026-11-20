import { GetMetadata } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { authorizeAction } from "@antelopejs/interface-dms/base/table-view/internal/auth";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { httpRejectionOf } from "../../../helpers/http-rejection";
import { StampedTableViewBuilder } from "../../../helpers/stamped-table-view-builder";
import { userFixture } from "../../../helpers/user-fixture";

const TENANT = "tv-undeclared-tenant";
const PERMISSION_ID = "tv-undeclared.notes.table";
const DECLARED = "list";
const UNDECLARED = "archive";
const HTTP_FORBIDDEN = 403;

/** A controller whose one mounted table view declares `list` alone. */
function tableViewInstance(stamps: Record<string, string | undefined>) {
  class Controller {}
  GetMetadata(Controller, TableViewMeta).addComponentBuilder(
    new StampedTableViewBuilder(stamps),
  );
  return new Controller();
}

const declaringList = () =>
  tableViewInstance({ [DECLARED]: `${PERMISSION_ID}.${DECLARED}` });

async function memberHolding(id: string, permissions: string[]): Promise<User> {
  const [roleId] = await GetModel(RoleModel, TENANT).insert({
    name: id,
    permissions,
  });
  await GetModel(TenantMemberModel, TENANT).insert({
    userId: id,
    roleIds: [roleId],
    isTenantOwner: false,
    invitedBy: null,
  });
  return userFixture({ _id: id });
}

describe("[unit] interfaces/dms-base/table-view — an action no table view declares", () => {
  it("serves a declared action to a member holding its permission", async () => {
    const member = await memberHolding("tv-undeclared-lister", [
      PERMISSION_ID,
      `${PERMISSION_ID}.${DECLARED}`,
    ]);

    const permissions = await authorizeAction(
      declaringList(),
      DECLARED,
      member,
      TENANT,
    );

    expect([...permissions]).to.include(`${PERMISSION_ID}.${DECLARED}`);
  });

  it("refuses a declared action to a member missing its permission", async () => {
    const member = await memberHolding("tv-undeclared-stranger", []);

    const error = await httpRejectionOf(
      authorizeAction(declaringList(), DECLARED, member, TENANT),
    );

    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
  });

  it("refuses an undeclared action to a member holding every declared permission", async () => {
    const member = await memberHolding("tv-undeclared-holder", [
      PERMISSION_ID,
      `${PERMISSION_ID}.${DECLARED}`,
    ]);

    const error = await httpRejectionOf(
      authorizeAction(declaringList(), UNDECLARED, member, TENANT),
    );

    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(error.getBody()).to.equal(
      `Forbidden: action "${UNDECLARED}" declares no permission`,
    );
  });

  it("refuses an action whose table view no page mounted to a member", async () => {
    const member = await memberHolding("tv-undeclared-unmounted", [
      PERMISSION_ID,
    ]);

    const error = await httpRejectionOf(
      authorizeAction(
        tableViewInstance({ [DECLARED]: undefined }),
        DECLARED,
        member,
        TENANT,
      ),
    );

    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
  });

  it("serves an undeclared action to a platform owner", async () => {
    const owner = userFixture({ _id: "tv-undeclared-owner", owner: true });

    const permissions = await authorizeAction(
      declaringList(),
      UNDECLARED,
      owner,
      TENANT,
    );

    expect([...permissions]).to.deep.equal(["*"]);
  });

  it("refuses an undeclared action to a member whose role stores *", async () => {
    const member = await memberHolding("tv-undeclared-wildcard-role", ["*"]);

    const error = await httpRejectionOf(
      authorizeAction(declaringList(), UNDECLARED, member, TENANT),
    );

    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
  });
});

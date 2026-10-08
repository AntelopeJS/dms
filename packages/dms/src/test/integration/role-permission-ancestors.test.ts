import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db/models";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// A permission is worth nothing without the ones it sits under: the role
// routes store a grant with every id above it, and a role stored without
// them — saved before the routes completed it — is refused the action.

const ROLES = "/settings/workspace/roles";
const ROLES_TABLE = "/api/tables/roles";
const ROLES_PAGE = "settings.workspace.roles";
const ROLES_TABLE_COMPONENT = `${ROLES_PAGE}.table`;
const LIST_ACTION = `${ROLES_TABLE_COMPONENT}.list`;
const DELETE_ACTION = `${ROLES_TABLE_COMPONENT}.delete`;
const DELETE_ANCESTORS = [
  ROLES_TABLE_COMPONENT,
  ROLES_PAGE,
  "settings.workspace",
  "settings",
];
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_FORBIDDEN = 403;

async function storedPermissions(roleId: string): Promise<string[]> {
  const role = await GetModel(RoleModel, DEFAULT_TENANT_ID).get(roleId);
  return role?.permissions ?? [];
}

async function memberHolding(permissions: string[]): Promise<AxiosInstance> {
  const [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
    name: `Holds ${permissions.join(", ")}`,
    permissions,
  });
  const member = await registerUser({ roles_ids: [roleId] });
  return authorizedClient(member.accessToken);
}

describe("[integration] role permissions and their ancestors", () => {
  let owner: AxiosInstance;

  beforeEach(async () => {
    await resetDatabase();
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
  });

  it("stores a created role with every id its permissions sit under", async () => {
    const created = await owner.post(`${ROLES}/create`, {
      name: "Deletes roles",
      permissions: [DELETE_ACTION],
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);

    expect(await storedPermissions(created.data.id)).to.have.members([
      DELETE_ACTION,
      ...DELETE_ANCESTORS,
    ]);
  });

  it("stores an updated role with every id its permissions sit under", async () => {
    const created = await owner.post(`${ROLES}/create`, { name: "Empty" });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);

    const updated = await owner.put(`${ROLES}/${created.data.id}`, {
      name: "Empty",
      permissions: [DELETE_ACTION],
    });
    expect(updated.status, JSON.stringify(updated.data)).to.be.oneOf([
      HTTP_OK,
      HTTP_NO_CONTENT,
    ]);

    expect(await storedPermissions(created.data.id)).to.have.members([
      DELETE_ACTION,
      ...DELETE_ANCESTORS,
    ]);
  });

  it("completes the permissions written through the roles table routes", async () => {
    const created = await owner.post(`${ROLES_TABLE}/new`, {
      name: "Written through the table",
      permissions: [DELETE_ACTION],
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);

    const role = await GetModel(RoleModel, DEFAULT_TENANT_ID).getByName(
      "Written through the table",
    );
    expect(role?.permissions).to.have.members([
      DELETE_ACTION,
      ...DELETE_ANCESTORS,
    ]);
  });

  it("refuses an action to a stored role missing the ids it sits under", async () => {
    const member = await memberHolding([LIST_ACTION]);

    const overview = await member.get(`${ROLES}/overview`);
    expect(overview.status).to.equal(HTTP_FORBIDDEN);
    const list = await member.get(`${ROLES_TABLE}/list`);
    expect(list.status).to.equal(HTTP_FORBIDDEN);
  });

  it("grants the action once the role holds the ids it sits under", async () => {
    const member = await memberHolding([
      LIST_ACTION,
      ROLES_TABLE_COMPONENT,
      ROLES_PAGE,
      "settings.workspace",
      "settings",
    ]);

    const overview = await member.get(`${ROLES}/overview`);
    expect(overview.status, JSON.stringify(overview.data)).to.equal(HTTP_OK);
    const list = await member.get(`${ROLES_TABLE}/list`);
    expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
  });
});

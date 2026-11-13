import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db/models";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { type BodyResponse, parseBody } from "../helpers/parse-body";

const ROLES = pageRoutePath("/settings/workspace/roles");
const ROLES_TABLE = "/api/tables/roles";
const ROLES_TABLE_COMPONENT = "settings.workspace.roles.table";
const ADD_ACTION = `${ROLES_TABLE_COMPONENT}.add`;
const EDIT_ACTION = `${ROLES_TABLE_COMPONENT}.edit`;
const WILDCARD = "*";
const NOT_HELD = "base-notes";
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

const CreatedRoleBody = z.object({ id: z.string() });
const SiteLayoutBody = z.object({ isOwner: z.boolean() });

function createdRoleId(response: BodyResponse): string {
  return parseBody(CreatedRoleBody, response).id;
}

async function storedPermissions(roleId: string): Promise<string[]> {
  const role = await GetModel(RoleModel, DEFAULT_TENANT_ID).get(roleId);
  return role?.permissions ?? [];
}

async function createRole(
  owner: AxiosInstance,
  name: string,
  permissions: string[],
): Promise<string> {
  const created = await owner.post(`${ROLES}/create`, { name, permissions });
  expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
  return createdRoleId(created);
}

describe("[integration] a member whose role holds *", () => {
  let owner: AxiosInstance;
  let member: AxiosInstance;

  beforeEach(async () => {
    await resetDatabase();
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
    const [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: "Self-granted every permission",
      permissions: [WILDCARD],
    });
    member = authorizedClient(
      (await registerUser({ roles_ids: [roleId] })).accessToken,
    );
  });

  it("is refused the module store before its body is read", async () => {
    const refused = await member.post("/dms/store/install", {});
    expect(refused.status, JSON.stringify(refused.data)).to.equal(
      HTTP_FORBIDDEN,
    );
    const validated = await owner.post("/dms/store/install", {});
    expect(validated.status, JSON.stringify(validated.data)).to.equal(
      HTTP_BAD_REQUEST,
    );
  });

  it("is refused the modules listing", async () => {
    const refused = await member.get("/dms/modules-listing");
    expect(refused.status, JSON.stringify(refused.data)).to.equal(
      HTTP_FORBIDDEN,
    );
    const served = await owner.get("/dms/modules-listing");
    expect(served.status, JSON.stringify(served.data)).to.equal(HTTP_OK);
  });

  it("is not the owner in the site layout", async () => {
    const memberLayout = await member.get("/dms/sitelayout");
    expect(parseBody(SiteLayoutBody, memberLayout).isOwner).to.equal(false);
    const ownerLayout = await owner.get("/dms/sitelayout");
    expect(parseBody(SiteLayoutBody, ownerLayout).isOwner).to.equal(true);
  });
});

describe("[integration] the roles API grants only what the editor holds", () => {
  let owner: AxiosInstance;
  let editor: AxiosInstance;
  let editorRoleId: string;

  beforeEach(async () => {
    await resetDatabase();
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
    editorRoleId = await createRole(owner, "Role editor", [
      ADD_ACTION,
      EDIT_ACTION,
    ]);
    editor = authorizedClient(
      (await registerUser({ roles_ids: [editorRoleId] })).accessToken,
    );
  });

  it("refuses * on the editor's own role, and leaves it unchanged", async () => {
    const before = await storedPermissions(editorRoleId);
    const refused = await editor.put(`${ROLES}/${editorRoleId}`, {
      name: "Role editor",
      permissions: [...before, WILDCARD],
    });
    expect(refused.status, JSON.stringify(refused.data)).to.equal(
      HTTP_FORBIDDEN,
    );
    expect(await storedPermissions(editorRoleId)).to.have.members(before);
  });

  it("refuses a permission the editor does not hold", async () => {
    const before = await storedPermissions(editorRoleId);
    const updated = await editor.put(`${ROLES}/${editorRoleId}`, {
      name: "Role editor",
      permissions: [...before, NOT_HELD],
    });
    expect(updated.status, JSON.stringify(updated.data)).to.equal(
      HTTP_FORBIDDEN,
    );
    const created = await editor.post(`${ROLES}/create`, {
      name: "Reads notes",
      permissions: [NOT_HELD],
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(
      HTTP_FORBIDDEN,
    );
  });

  it("refuses * to the platform owner too", async () => {
    const created = await owner.post(`${ROLES}/create`, {
      name: "Everything",
      permissions: [WILDCARD],
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(
      HTTP_FORBIDDEN,
    );
  });

  it("refuses * and unheld permissions through the roles table routes", async () => {
    const created = await editor.post(`${ROLES_TABLE}/new`, {
      name: "Everything",
      permissions: [WILDCARD],
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(
      HTTP_FORBIDDEN,
    );
    const edited = await editor.put(
      `${ROLES_TABLE}/edit`,
      { permissions: [NOT_HELD] },
      { params: { id: editorRoleId } },
    );
    expect(edited.status, JSON.stringify(edited.data)).to.equal(HTTP_FORBIDDEN);
    expect(await storedPermissions(editorRoleId)).to.not.include(NOT_HELD);
  });

  it("refuses to copy a role holding what the editor does not", async () => {
    const notes = await createRole(owner, "Reads notes", [NOT_HELD]);
    const copied = await editor.post(`${ROLES}/${notes}/duplicate`, {
      name: "Reads notes too",
    });
    expect(copied.status, JSON.stringify(copied.data)).to.equal(HTTP_FORBIDDEN);
  });

  it("grants what the editor holds, and keeps what a role held already", async () => {
    const created = await editor.post(`${ROLES}/create`, {
      name: "Adds roles",
      permissions: [ADD_ACTION],
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);

    const notes = await createRole(owner, "Reads notes", [NOT_HELD]);
    const kept = await storedPermissions(notes);
    const renamed = await editor.put(`${ROLES}/${notes}`, {
      name: "Reads notes, renamed",
      permissions: kept,
    });
    expect(renamed.status, JSON.stringify(renamed.data)).to.be.oneOf([
      HTTP_OK,
      HTTP_NO_CONTENT,
    ]);
    expect(await storedPermissions(notes)).to.have.members(kept);
  });
});

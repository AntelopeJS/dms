import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db/models";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const MODULE_TABLE = "/api/module-table/notes";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

describe("[integration] a member whose stored role holds *", () => {
  let owner: AxiosInstance;
  let member: AxiosInstance;

  beforeEach(async () => {
    await resetDatabase();
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
    const [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: "Stored before roles refused *",
      permissions: ["*"],
    });
    member = authorizedClient(
      (await registerUser({ roles_ids: [roleId] })).accessToken,
    );
  });

  it("is refused a module's table routes the platform owner is served", async () => {
    const listed = await owner.get(`${MODULE_TABLE}/list`);
    expect(listed.status, JSON.stringify(listed.data)).to.equal(HTTP_OK);
    const refusedList = await member.get(`${MODULE_TABLE}/list`);
    expect(refusedList.status, JSON.stringify(refusedList.data)).to.equal(
      HTTP_FORBIDDEN,
    );
    const refusedNew = await member.post(`${MODULE_TABLE}/new`, {
      title: "Written through a stored *",
    });
    expect(refusedNew.status, JSON.stringify(refusedNew.data)).to.equal(
      HTTP_FORBIDDEN,
    );
  });
});

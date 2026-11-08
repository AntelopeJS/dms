import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

const HTTP_OK = 200;
const NO_MEMBERSHIP_PATH = "/auth/no-membership";

async function memberRowId(userId: string): Promise<string> {
  const member = await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).getByUser(
    userId,
  );
  if (!member) throw new Error(`${userId} is no member`);
  return member._id;
}

describe("[integration] the page a sign-in that belongs to no workspace lands on", () => {
  beforeEach(resetDatabase);

  it("is served to the removed member who signs in again, before any session exists", async () => {
    const owner = authorizedClient(
      (await registerUser({ owner: true })).accessToken,
    );
    const member = await registerUser();
    const removal = await owner.delete("/api/tables/members/delete", {
      params: { id: await memberRowId(member.userId) },
    });
    expect(removal.status, JSON.stringify(removal.data)).to.equal(HTTP_OK);

    const visitor = createClient();
    const login = await visitor.post("/api/auth/login", {
      email: member.email,
      password: member.password,
    });
    expect(login.status, JSON.stringify(login.data)).to.equal(HTTP_OK);
    expect(login.data.requires_tenant_assignment).to.equal(true);
    expect(login.data).to.not.have.property("access_token");

    const page = await visitor.get("/dms/page", {
      params: { path: NO_MEMBERSHIP_PATH, shared: "false" },
    });
    expect(page.status, JSON.stringify(page.data)).to.equal(HTTP_OK);
    expect(page.data.route.fullSlug).to.equal(NO_MEMBERSHIP_PATH);
    expect(page.data.route.hasAccess).to.equal(true);
    expect(JSON.stringify(page.data.layout.components)).to.include(
      "DmsAuthNoMembership",
    );
  });
});

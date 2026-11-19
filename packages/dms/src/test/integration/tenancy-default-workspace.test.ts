import { expect } from "chai";
import { z } from "zod";
import { authorizedClient } from "../helpers/auth";
import { createClient } from "../helpers/http";
import { seedUnclaimedInstance } from "../helpers/onboarding";
import { parseBody } from "../helpers/parse-body";

const SETUP_TOKEN = "a-tenancy-setup-token-of-24-chars";
const FOREIGN_WORKSPACE = "never-joined-workspace";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

const owner = {
  firstName: "Camille",
  lastName: "Laurent",
  email: "tenancy-owner@test.local",
  password: "Onboarding42!",
};

const LoginBody = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
});
const MembersBody = z.object({
  results: z.array(z.object({ _id: z.string(), isTenantOwner: z.boolean() })),
});
const SwitchedBody = z.object({ access_token: z.string() });

describe("[integration] default workspace membership", () => {
  let accessToken: string;
  let refreshToken: string;

  before(async () => {
    await seedUnclaimedInstance(SETUP_TOKEN);
    const registered = await createClient().post("/api/onboarding/register", {
      ...owner,
      setupToken: SETUP_TOKEN,
    });
    expect(registered.status, JSON.stringify(registered.data)).to.equal(
      HTTP_OK,
    );
    const login = await createClient().post("/api/auth/login", {
      email: owner.email,
      password: owner.password,
    });
    ({ access_token: accessToken, refresh_token: refreshToken } = parseBody(
      LoginBody,
      login,
    ));
  });

  after(() => seedUnclaimedInstance());

  function switchTo(tenantId: string) {
    return createClient().post("/api/auth/switch-tenant", {
      refreshToken,
      tenantId,
    });
  }

  it("makes the onboarded owner the default workspace's only member, as its owner", async () => {
    const members = await authorizedClient(accessToken).get(
      "/api/tables/members/list",
    );

    const { results } = parseBody(MembersBody, members);
    expect(results.map((row) => row._id.split(":")[0])).to.deep.equal([
      "default",
    ]);
    expect(results.map((row) => row.isTenantOwner)).to.deep.equal([true]);
  });

  it("refuses a switch to a workspace the owner is not a member of with error.not_a_member, then lets the same session switch back to the default one", async () => {
    const foreign = await switchTo(FOREIGN_WORKSPACE);
    const home = await switchTo("default");

    expect(foreign.status, JSON.stringify(foreign.data)).to.equal(
      HTTP_FORBIDDEN,
    );
    expect(foreign.data).to.equal("error.not_a_member");
    expect(home.status, JSON.stringify(home.data)).to.equal(HTTP_OK);
    expect(parseBody(SwitchedBody, home).access_token).to.not.equal("");
  });
});

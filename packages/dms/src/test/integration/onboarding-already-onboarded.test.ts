import { StartModule, StopModule } from "@antelopejs/interface-core/modules";
import { expect } from "chai";
import { z } from "zod";
import { authorizedClient } from "../helpers/auth";
import { createClient } from "../helpers/http";
import { hasOnboarded, seedUnclaimedInstance } from "../helpers/onboarding";
import { parseBody } from "../helpers/parse-body";

const SETUP_TOKEN = "an-onboarded-setup-token-of-24-chars";
const DMS_MODULE = "local";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

const first = {
  firstName: "Camille",
  lastName: "Laurent",
  email: "first-owner@test.local",
  password: "Onboarding42!",
};

const LoginBody = z.object({ access_token: z.string() });
const MembersBody = z.object({
  results: z.array(z.object({ email: z.string(), isTenantOwner: z.boolean() })),
});

describe("[integration] a platform that is already onboarded", function () {
  this.timeout(30_000);

  before(async () => {
    await seedUnclaimedInstance(SETUP_TOKEN);
    const registered = await createClient().post("/api/onboarding/register", {
      ...first,
      setupToken: SETUP_TOKEN,
    });
    expect(registered.status, JSON.stringify(registered.data)).to.equal(
      HTTP_OK,
    );
  });

  after(() => seedUnclaimedInstance());

  it("refuses a second registration even with the setup token, and keeps its first owner the only one", async () => {
    const second = await createClient().post("/api/onboarding/register", {
      ...first,
      email: "second-owner@test.local",
      setupToken: SETUP_TOKEN,
    });
    const login = await createClient().post("/api/auth/login", {
      email: first.email,
      password: first.password,
    });
    const members = await authorizedClient(
      parseBody(LoginBody, login).access_token,
    ).get("/api/tables/members/list");

    expect(second.status).to.equal(HTTP_BAD_REQUEST);
    expect(second.data).to.equal("error.admin_already_set");
    const owners = parseBody(MembersBody, members)
      .results.filter((member) => member.isTenantOwner)
      .map((member) => member.email);
    expect(owners).to.deep.equal([first.email]);
  });

  it("is still onboarded after the DMS module stops and starts again", async () => {
    await StopModule(DMS_MODULE);
    await StartModule(DMS_MODULE);

    expect(await hasOnboarded()).to.equal(true);
  });
});

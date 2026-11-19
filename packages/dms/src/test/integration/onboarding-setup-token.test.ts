import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { assert, expect } from "chai";
import { z } from "zod";
import { announceSetupToken, SetupTokenModel } from "../../db";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";
import { hasOnboarded, seedUnclaimedInstance } from "../helpers/onboarding";
import { parseBody } from "../helpers/parse-body";

const REGISTER_PATH = "/api/onboarding/register";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const SETUP_TOKEN = "a-setup-token-of-24-chars";
const ENV_SETUP_TOKEN = "an-env-setup-token-0123456789";

const owner = {
  firstName: "Camille",
  lastName: "Laurent",
  email: "owner@test.local",
  password: "Onboarding42!",
};

type Registration = typeof owner & { setupToken?: string };

function register(body: Partial<Registration>) {
  return createClient().post(REGISTER_PATH, { ...owner, ...body });
}

const SessionBody = z.object({ access_token: z.string() });
const MeBody = z.object({ owner: z.boolean() });

/** `owner` as `GET /api/auth/me` reads it for the session a login answered. */
async function ownerFlagOf(
  login: z.infer<typeof SessionBody>,
): Promise<boolean> {
  const { access_token } = login;
  const me = await createClient().get("/api/auth/me", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  return parseBody(MeBody, me).owner;
}

async function userCount(): Promise<number> {
  return (await GetModel(UserModel).getAll()).length;
}

describe("[integration] onboarding setup token", () => {
  beforeEach(() => seedUnclaimedInstance(SETUP_TOKEN));
  after(() => seedUnclaimedInstance());

  it("refuses a registration without the token and creates no user", async () => {
    const response = await register({});

    expect(response.status).to.equal(HTTP_FORBIDDEN);
    expect(response.data).to.equal("error.invalid_setup_token");
    expect(await userCount()).to.equal(0);
    expect(await hasOnboarded()).to.equal(false);
  });

  it("refuses a registration with a wrong token and creates no user", async () => {
    const response = await register({ setupToken: `${SETUP_TOKEN}-wrong` });

    expect(response.status).to.equal(HTTP_FORBIDDEN);
    expect(response.data).to.equal("error.invalid_setup_token");
    expect(await userCount()).to.equal(0);
    expect(await hasOnboarded()).to.equal(false);
  });

  it("keeps the token usable after a refused attempt", async () => {
    await register({ setupToken: "wrong" });
    const response = await register({ setupToken: SETUP_TOKEN });

    expect(response.status).to.equal(HTTP_OK);
  });

  it("creates the owner with the token and spends it", async () => {
    const response = await register({ setupToken: SETUP_TOKEN });

    expect(response.status).to.equal(HTTP_OK);
    const created = await GetModel(UserModel).getByEmail(owner.email);
    expect(created?.owner).to.equal(true);
    expect(await GetModel(SetupTokenModel).claim(SETUP_TOKEN)).to.equal(
      undefined,
    );
    expect(await hasOnboarded()).to.equal(true);
  });

  it("refuses a second registration with error.admin_already_set", async () => {
    await register({ setupToken: SETUP_TOKEN });
    const second = await register({
      setupToken: SETUP_TOKEN,
      email: "second@test.local",
    });

    expect(second.status).to.equal(HTTP_BAD_REQUEST);
    expect(second.data).to.equal("error.admin_already_set");
    expect(await userCount()).to.equal(1);
    expect(await hasOnboarded()).to.equal(true);
  });

  it("creates a single owner when valid registrations race, and no account behind a refused one", async () => {
    const emails = ["one", "two", "three", "four"].map(
      (name) => `${name}@test.local`,
    );
    const answers = await Promise.all(
      emails.map((email) => register({ setupToken: SETUP_TOKEN, email })),
    );

    expect(
      answers.filter((answer) => answer.status === HTTP_OK),
    ).to.have.length(1);
    expect(await userCount()).to.equal(1);
    expect(await hasOnboarded()).to.equal(true);
    for (const [index, email] of emails.entries()) {
      const accepted = answers[index]?.status === HTTP_OK;
      const session = await createClient().post("/api/auth/login", {
        email,
        password: owner.password,
      });
      expect(session.status, email).to.equal(accepted ? HTTP_OK : 401);
      if (accepted) {
        expect(await ownerFlagOf(parseBody(SessionBody, session))).to.equal(
          true,
        );
      }
    }
  });
});

describe("[integration] setup token at start", () => {
  let tokens: SetupTokenModel;
  let configured: string | undefined;

  beforeEach(async () => {
    configured = process.env.DMS_SETUP_TOKEN;
    delete process.env.DMS_SETUP_TOKEN;
    await resetDatabase();
    tokens = GetModel(SetupTokenModel);
  });

  afterEach(() => {
    if (configured === undefined) delete process.env.DMS_SETUP_TOKEN;
    else process.env.DMS_SETUP_TOKEN = configured;
  });

  it("generates one token and gives every later start the same one", async () => {
    await announceSetupToken();
    const first = await tokens.ensure();
    await announceSetupToken();

    expect(first).to.have.length.greaterThan(32);
    expect(await tokens.ensure()).to.equal(first);
    expect(await tokens.claim(first)).to.equal(first);
  });

  it("agrees on one token when replicas start together", async () => {
    const seen = await Promise.all(
      Array.from({ length: 6 }, () => tokens.ensure()),
    );

    expect(new Set(seen).size).to.equal(1);
  });

  it("stores the configured token", async () => {
    process.env.DMS_SETUP_TOKEN = ENV_SETUP_TOKEN;
    await announceSetupToken();

    expect(await tokens.claim(ENV_SETUP_TOKEN)).to.equal(ENV_SETUP_TOKEN);
  });

  it("refuses to start with a configured token too short to protect the instance", async () => {
    process.env.DMS_SETUP_TOKEN = "short";
    const failure = await announceSetupToken().then(
      () => undefined,
      (error: unknown) => error,
    );

    assert.instanceOf(failure, Error);
    expect(failure.message).to.contain("DMS_SETUP_TOKEN");
  });

  it("drops the token once an owner exists", async () => {
    await tokens.ensure(ENV_SETUP_TOKEN);
    await GetModel(UserModel).insert({
      _id: "existing-owner",
      email: "existing@test.local",
      name: "Existing",
      authKey: "existing-key",
      isValidated: true,
      language: "en",
      password: null,
      owner: true,
    });
    await announceSetupToken();

    expect(await tokens.claim(ENV_SETUP_TOKEN)).to.equal(undefined);
  });
});

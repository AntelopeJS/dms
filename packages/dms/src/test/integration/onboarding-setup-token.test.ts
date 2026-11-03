import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { assert, expect } from "chai";
import {
  announceSetupToken,
  SetupTokenModel,
  SystemStateModel,
} from "../../db";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";

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

async function userCount(): Promise<number> {
  return (await GetModel(UserModel).getAll()).length;
}

async function seedUnclaimedInstance(): Promise<void> {
  await resetDatabase();
  await GetModel(SystemStateModel).insert({
    has_onboarded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await GetModel(SetupTokenModel).ensure(SETUP_TOKEN);
}

describe("[integration] onboarding setup token", () => {
  beforeEach(seedUnclaimedInstance);
  after(async () => {
    await resetDatabase();
    await GetModel(SystemStateModel).insert({
      has_onboarded: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("refuses a registration without the token and creates no user", async () => {
    const response = await register({});

    expect(response.status).to.equal(HTTP_FORBIDDEN);
    expect(response.data).to.equal("error.invalid_setup_token");
    expect(await userCount()).to.equal(0);
  });

  it("refuses a registration with a wrong token and creates no user", async () => {
    const response = await register({ setupToken: `${SETUP_TOKEN}-wrong` });

    expect(response.status).to.equal(HTTP_FORBIDDEN);
    expect(response.data).to.equal("error.invalid_setup_token");
    expect(await userCount()).to.equal(0);
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
  });

  it("creates a single owner when valid registrations race", async () => {
    const answers = await Promise.all(
      ["one", "two", "three", "four"].map((name) =>
        register({ setupToken: SETUP_TOKEN, email: `${name}@test.local` }),
      ),
    );

    expect(
      answers.filter((answer) => answer.status === HTTP_OK),
    ).to.have.length(1);
    expect(await userCount()).to.equal(1);
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

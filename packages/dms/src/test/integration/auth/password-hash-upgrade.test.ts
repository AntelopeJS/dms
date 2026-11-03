import { GetModel } from "@antelopejs/interface-database-decorators";
import { SessionModel, UserModel } from "@antelopejs/interface-dms/auth/db";
import { assert, expect } from "chai";
import { login, upgradePasswordHash } from "../../../routes/authentication";
import { registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const OLDER_PASSWORD = "correct horse battery staple";
const WRONG_PASSWORD = "Wrong-password-1";
const NEW_PASSWORD = "New-Passw0rd-after-change!";
const UPGRADE_DEADLINE_MS = 3000;
const SIGN_IN_SERIES_TIMEOUT_MS = 10_000;
const ORIGIN = { ip: "203.0.113.200" };

/** A stored hash of {@link OLDER_PASSWORD} in an older format. */
const OLDER_INTERNAL = {
  meta: { HashModifier: { salt: "BMNyCHwpLNt2tkqkyB5rwOj1q2wfDIo6" } },
  data: { password: "nPamXXaKC8N+8W7xqxTSo8r+pS9jXMkjJu2XMZtUR+A=" },
};

async function signIn(email: string, password: string) {
  const response = await createClient().post("/api/auth/login", {
    email,
    password,
  });
  return response.status;
}

async function accountWithOlderHash() {
  const { email, userId } = await registerUser();
  const user = await reload(userId);
  await GetModel(UserModel).update(
    Object.assign(user, { _internal: structuredClone(OLDER_INTERNAL) }),
  );
  return { email, userId };
}

async function reload(userId: string) {
  const user = await GetModel(UserModel).get(userId);
  if (!user) throw new Error(`User ${userId} not found`);
  return user;
}

async function waitForUpgrade(userId: string) {
  const deadline = Date.now() + UPGRADE_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (!(await reload(userId)).isHashOutdated("password")) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The password hash was not upgraded in time");
}

async function fastestSignInMs(email: string) {
  const runs: number[] = [];
  for (const _ of [0, 1, 2]) {
    const started = performance.now();
    await signIn(email, WRONG_PASSWORD);
    runs.push(performance.now() - started);
  }
  return Math.min(...runs);
}

describe("[integration] auth/login password hash upgrade", function () {
  this.timeout(SIGN_IN_SERIES_TIMEOUT_MS);

  beforeEach(async () => {
    await resetDatabase();
  });

  it("signs in on an older hash and upgrades it, keeping the rest of the account", async () => {
    const { email, userId } = await accountWithOlderHash();
    const before = await reload(userId);
    expect(before.isHashOutdated("password")).to.equal(true);

    expect(await signIn(email, OLDER_PASSWORD)).to.equal(HTTP_OK);
    await waitForUpgrade(userId);

    const after = await reload(userId);
    expect(after.password).to.match(/^\$scrypt\$/);
    expect(after.authKey).to.equal(before.authKey);
    expect(after.updatedAt).to.deep.equal(before.updatedAt);
    expect(after.passwordChangedAt).to.deep.equal(before.passwordChangedAt);
    expect(after.email).to.equal(before.email);
  });

  it("keeps the upgraded hash through later sign-ins", async () => {
    const { email, userId } = await accountWithOlderHash();
    await signIn(email, OLDER_PASSWORD);
    await waitForUpgrade(userId);
    const upgraded = (await reload(userId)).password;

    expect(await signIn(email, OLDER_PASSWORD)).to.equal(HTTP_OK);
    expect(await signIn(email, WRONG_PASSWORD)).to.equal(HTTP_UNAUTHORIZED);

    expect((await reload(userId)).password).to.equal(upgraded);
  });

  it("leaves the older hash on a wrong password", async () => {
    const { email, userId } = await accountWithOlderHash();

    expect(await signIn(email, WRONG_PASSWORD)).to.equal(HTTP_UNAUTHORIZED);

    expect((await reload(userId)).password).to.equal(
      OLDER_INTERNAL.data.password,
    );
  });

  it("does not bring back a password changed while the sign-in ran", async () => {
    const { userId } = await accountWithOlderHash();
    const readBySignIn = await reload(userId);
    const changed = await reload(userId);
    changed.password = NEW_PASSWORD;
    await GetModel(UserModel).update(changed);

    await upgradePasswordHash(
      GetModel(UserModel),
      readBySignIn,
      OLDER_PASSWORD,
    );

    const stored = await reload(userId);
    expect(stored.testHash("password", NEW_PASSWORD)).to.equal(true);
    expect(stored.testHash("password", OLDER_PASSWORD)).to.equal(false);
  });

  it("keeps a field changed while the sign-in ran", async () => {
    const { userId } = await accountWithOlderHash();
    const readBySignIn = await reload(userId);
    const changed = await reload(userId);
    changed.name = "Renamed meanwhile";
    await GetModel(UserModel).update(changed);

    await upgradePasswordHash(
      GetModel(UserModel),
      readBySignIn,
      OLDER_PASSWORD,
    );

    const stored = await reload(userId);
    expect(stored.name).to.equal("Renamed meanwhile");
    expect(stored.isHashOutdated("password")).to.equal(false);
  });

  it("still signs in when the upgrade cannot be saved", async () => {
    const { email, userId } = await accountWithOlderHash();
    const userModel = GetModel(UserModel);
    const refusingWrites: unknown = Object.create(userModel, {
      getByEmail: { value: userModel.getByEmail.bind(userModel) },
      table: {
        value: {
          getAll: () => {
            throw new Error("The database refuses this write");
          },
        },
      },
    });
    assert.instanceOf(refusingWrites, UserModel);

    const outcome = await login(
      refusingWrites,
      GetModel(SessionModel),
      { email, password: OLDER_PASSWORD },
      "test-agent",
      ORIGIN,
    );

    expect(outcome).to.have.property("user");
    expect((await reload(userId)).password).to.equal(
      OLDER_INTERNAL.data.password,
    );
  });

  it("refuses an unknown address in the time a wrong password takes", async () => {
    const { email } = await registerUser();

    const known = await fastestSignInMs(email);
    const unknown = await fastestSignInMs(`nobody-${Date.now()}@test.local`);

    expect(unknown).to.be.greaterThan(known / 3);
  });
});

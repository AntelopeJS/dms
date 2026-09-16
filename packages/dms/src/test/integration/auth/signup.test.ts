import { expect } from "chai";
import { resetDatabase } from "../../helpers/db";
import { seedUserInvite } from "../../helpers/fixtures";
import { createClient } from "../../helpers/http";

const SIGNUP_URL = "/api/auth/signup";
const VALID_PASSWORD = "TestPassw0rd!";
const WEAK_PASSWORD = "weak";
const TEST_EMAIL = "signup-success@test.local";
const OTHER_EMAIL = "other@test.local";
const NAME = "Signup User";
const LANG = "en";
const EXPIRED_INVITE_MS = -1000;
const UNKNOWN_TOKEN = "00000000-0000-0000-0000-000000000000";

// SKIPPED: depends on seeding state in-process (helpers/fixtures) that the
// route handlers cannot see. Under `ajs module test`, mocha-loaded test code and
// the runtime-loaded module get separate interface-database instances, so an
// invite seeded via GetModel is invisible to the signup route. See TESTING.md.
describe.skip("[integration] auth/signup", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("signs up a user with a valid invite and returns tokens", async () => {
    const invite = await seedUserInvite({ email: TEST_EMAIL });

    const client = createClient();
    const response = await client.post(SIGNUP_URL, {
      name: NAME,
      email: TEST_EMAIL,
      password: VALID_PASSWORD,
      lang: LANG,
      token: invite.token,
    });

    expect(response.status).to.equal(200);
    expect(response.data.token_type).to.equal("Bearer");
    expect(response.data.access_token).to.be.a("string").and.not.empty;
    expect(response.data.refresh_token).to.be.a("string").and.not.empty;
    expect(response.data.user?.email).to.equal(TEST_EMAIL);
  });

  it("rejects signup with an unknown token with 400", async () => {
    const client = createClient();
    const response = await client.post(SIGNUP_URL, {
      name: NAME,
      email: TEST_EMAIL,
      password: VALID_PASSWORD,
      lang: LANG,
      token: UNKNOWN_TOKEN,
    });

    expect(response.status).to.equal(400);
  });

  it("rejects signup when body email does not match invite email with 400", async () => {
    const invite = await seedUserInvite({ email: TEST_EMAIL });

    const client = createClient();
    const response = await client.post(SIGNUP_URL, {
      name: NAME,
      email: OTHER_EMAIL,
      password: VALID_PASSWORD,
      lang: LANG,
      token: invite.token,
    });

    expect(response.status).to.equal(400);
  });

  it("rejects signup when invite is expired with 400", async () => {
    const invite = await seedUserInvite({
      email: TEST_EMAIL,
      lifetimeMs: EXPIRED_INVITE_MS,
    });

    const client = createClient();
    const response = await client.post(SIGNUP_URL, {
      name: NAME,
      email: TEST_EMAIL,
      password: VALID_PASSWORD,
      lang: LANG,
      token: invite.token,
    });

    expect(response.status).to.equal(400);
  });

  it("rejects signup with a malformed email with 400", async () => {
    const invite = await seedUserInvite({ email: TEST_EMAIL });

    const client = createClient();
    const response = await client.post(SIGNUP_URL, {
      name: NAME,
      email: "not-an-email",
      password: VALID_PASSWORD,
      lang: LANG,
      token: invite.token,
    });

    expect(response.status).to.equal(400);
  });

  it("rejects signup with a weak password with 400", async () => {
    const invite = await seedUserInvite({ email: TEST_EMAIL });

    const client = createClient();
    const response = await client.post(SIGNUP_URL, {
      name: NAME,
      email: TEST_EMAIL,
      password: WEAK_PASSWORD,
      lang: LANG,
      token: invite.token,
    });

    expect(response.status).to.equal(400);
  });
});

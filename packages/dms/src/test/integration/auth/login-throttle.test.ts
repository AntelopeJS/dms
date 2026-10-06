import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { getAuthConfig } from "../../../config";
import { SignInAttemptsModel } from "../../../db/models/signInAttempts.model";
import { registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

// Wrong passwords are throttled per typed address and per client address, and
// the burst check reads a bounded number of attempts however many are stored.
// Each case signs in from a client address of its own (one trusted proxy), so
// none spends the budget of the address the other suites sign in from.

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const FAILURES_PER_ACCOUNT = 10;
const FAILURES_PER_CLIENT = 50;
const WRONG_PASSWORD = "Wrong-password-1";
const STORED_FAILURES = 30;
const BURST_THRESHOLD = 5;
const WINDOW_MS = 15 * 60 * 1000;

let counter = 0;
const next = () => (counter += 1);
const freshEmail = () => `throttle-${Date.now()}-${next()}@test.local`;
const freshClient = () => `203.0.113.${next()}`;

async function signIn(email: string, password: string, client: string) {
  const response = await createClient().post(
    "/api/auth/login",
    { email, password },
    { headers: { "x-forwarded-for": client } },
  );
  return response.status;
}

describe("[integration] auth/login throttle", () => {
  let previousProxies: number | undefined;
  let client: string;

  before(() => {
    previousProxies = getAuthConfig().trustedProxies;
    getAuthConfig().trustedProxies = 1;
  });

  after(() => {
    getAuthConfig().trustedProxies = previousProxies;
  });

  beforeEach(async () => {
    await resetDatabase();
    client = freshClient();
  });

  it("refuses an account its right password after too many wrong ones", async () => {
    const user = await registerUser();
    for (let attempt = 0; attempt < FAILURES_PER_ACCOUNT; attempt++) {
      expect(await signIn(user.email, WRONG_PASSWORD, client)).to.equal(
        HTTP_UNAUTHORIZED,
      );
    }
    expect(await signIn(user.email, user.password, client)).to.equal(
      HTTP_TOO_MANY_REQUESTS,
    );
  });

  it("throttles an unknown address the same, telling nothing of its existence", async () => {
    const email = freshEmail();
    for (let attempt = 0; attempt < FAILURES_PER_ACCOUNT; attempt++) {
      expect(await signIn(email, WRONG_PASSWORD, client)).to.equal(
        HTTP_UNAUTHORIZED,
      );
    }
    expect(await signIn(email, WRONG_PASSWORD, client)).to.equal(
      HTTP_TOO_MANY_REQUESTS,
    );
  });

  it("forgets an account's failures once it signs in", async () => {
    const user = await registerUser();
    for (let attempt = 0; attempt < FAILURES_PER_ACCOUNT - 1; attempt++) {
      await signIn(user.email, WRONG_PASSWORD, client);
    }
    expect(await signIn(user.email, user.password, client)).to.equal(HTTP_OK);
    expect(await signIn(user.email, WRONG_PASSWORD, client)).to.equal(
      HTTP_UNAUTHORIZED,
    );
  });

  describe("per client address", () => {
    it("refuses a client that failed too often, whichever accounts it tried", async () => {
      for (let attempt = 0; attempt < FAILURES_PER_CLIENT; attempt++) {
        await signIn(freshEmail(), WRONG_PASSWORD, client);
      }
      const user = await registerUser();
      expect(await signIn(user.email, user.password, client)).to.equal(
        HTTP_TOO_MANY_REQUESTS,
      );
      expect(await signIn(user.email, user.password, freshClient())).to.equal(
        HTTP_OK,
      );
    });
  });

  it("reads a bounded burst however many failures are stored", async () => {
    const user = await registerUser();
    const attempts = GetModel(SignInAttemptsModel);
    const now = new Date();
    for (let stored = 0; stored < STORED_FAILURES; stored++) {
      await attempts.recordFailure(user.userId, now);
    }
    const since = new Date(now.getTime() - WINDOW_MS);
    expect(
      await attempts.listBurst(user.userId, since, BURST_THRESHOLD),
    ).to.have.length(BURST_THRESHOLD);
    await attempts.claimAlert(user.userId, "burst", now);
    const burst = await attempts.listBurst(user.userId, since, BURST_THRESHOLD);
    expect(burst.filter((row) => row.kind === "alerted")).to.have.length(1);
    expect(burst).to.have.length(BURST_THRESHOLD + 1);
  });
});

import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { generateCode } from "2fa";
import { acceptTotpCode, totpStepAt } from "../../../utils/two-factor-codes";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import {
  captureEmails,
  lastRenderedEmail,
  renderedEmails,
} from "../../helpers/emails";
import { createClient } from "../../helpers/http";

// The codes of a second factor: a sign-in challenge takes a handful of them,
// an emailed code is stored hashed, an authenticator code works once, and
// email codes turn on only once one of them came back.

const TWO_FACTOR = "/settings/user/security/two-factor";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const TWO_FACTOR_EMAIL_TEMPLATE = "EmailTwoFactor";
const ATTEMPTS_PER_CHALLENGE = 5;
const WRONG_BACKUP_CODE = "WRONG000";
const TOTP_STEP_MS = 30 * 1000;
// A code computed this close to the end of its window may reach the server
// in the next one: wait for the next window instead.
const TOTP_SAFE_MARGIN_MS = 3 * 1000;
const RATE_LIMIT_MS = 60 * 1000;
// Two-factor tokens are signed to the second: a sign-in in the same second
// would get the very same token, hence the same challenge.
const NEXT_TOKEN_DELAY_MS = 1100;
const TEST_TIMEOUT_MS = 20 * 1000;
const SHA256_HEX = /^[0-9a-f]{64}$/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function currentTotpCode(secret: string): Promise<string> {
  const leftInStep = TOTP_STEP_MS - (Date.now() % TOTP_STEP_MS);
  if (leftInStep < TOTP_SAFE_MARGIN_MS) await sleep(leftInStep);
  return generateCode(secret, totpStepAt(Date.now()));
}

interface EnabledTotp {
  secret: string;
  code: string;
  backupCodes: string[];
}

async function enableTotp(
  client: AxiosInstance,
  user: RegisteredUser,
): Promise<EnabledTotp> {
  const setup = await client.post(`${TWO_FACTOR}/enable-totp`, {
    currentPassword: user.password,
  });
  expect(setup.status, JSON.stringify(setup.data)).to.equal(HTTP_OK);
  const { secret } = setup.data as { secret: string };
  const code = await currentTotpCode(secret);
  const confirmed = await client.post(`${TWO_FACTOR}/confirm-totp`, { code });
  expect(confirmed.status, JSON.stringify(confirmed.data)).to.equal(HTTP_OK);
  return { secret, code, backupCodes: confirmed.data.backupCodes };
}

async function lastEmailedCode(): Promise<string> {
  const email = await lastRenderedEmail(TWO_FACTOR_EMAIL_TEMPLATE);
  const code = email?.props.verificationCode;
  if (typeof code !== "string") throw new Error("No two-factor code was sent");
  return code;
}

async function signIn(user: RegisteredUser): Promise<string> {
  const response = await createClient().post("/api/auth/login", {
    email: user.email,
    password: user.password,
  });
  expect(response.data.requires_2fa, JSON.stringify(response.data)).to.equal(
    true,
  );
  return response.data.two_factor_token as string;
}

function verify(token: string, method: string, code: string) {
  return createClient().post("/api/auth/verify-2fa", { token, code, method });
}

async function storedUser(userId: string): Promise<User> {
  const user = await GetModel(UserModel).get(userId);
  if (!user) throw new Error(`No user ${userId}`);
  return user;
}

// Ages the last emailed code past the resend limit, so a test can ask for
// another one at once.
async function allowNextEmailCode(userId: string): Promise<void> {
  const user = await storedUser(userId);
  user.twoFactorEmailCodeRequestedAt = new Date(Date.now() - RATE_LIMIT_MS);
  await GetModel(UserModel).update(user);
}

describe("[integration] auth/two-factor codes", function () {
  this.timeout(TEST_TIMEOUT_MS);

  let user: RegisteredUser;
  let client: AxiosInstance;

  const methods = async () =>
    (await client.get(TWO_FACTOR)).data.methods as string[];

  const startEmailSetup = () =>
    client.post(`${TWO_FACTOR}/enable-email`, {
      currentPassword: user.password,
    });

  before(captureEmails);

  beforeEach(async () => {
    renderedEmails.length = 0;
    await resetDatabase();
    user = await registerUser({ owner: true });
    client = authorizedClient(user.accessToken);
  });

  describe("sign-in challenge", () => {
    it("is spent after 5 codes, even before the right one comes", async () => {
      const { backupCodes } = await enableTotp(client, user);
      const token = await signIn(user);
      for (let attempt = 0; attempt < ATTEMPTS_PER_CHALLENGE; attempt++) {
        const refused = await verify(token, "backup", WRONG_BACKUP_CODE);
        expect(refused.status).to.equal(HTTP_UNAUTHORIZED);
      }

      const spent = await verify(token, "backup", backupCodes[0]);
      expect(spent.status).to.equal(HTTP_TOO_MANY_REQUESTS);
      expect(JSON.stringify(spent.data)).to.include(
        "error.too_many_2fa_attempts",
      );

      await sleep(NEXT_TOKEN_DELAY_MS);
      const fresh = await verify(await signIn(user), "backup", backupCodes[0]);
      expect(fresh.status, JSON.stringify(fresh.data)).to.equal(HTTP_OK);
    });

    it("sends no more email codes for a spent challenge", async () => {
      await startEmailSetup();
      await client.post(`${TWO_FACTOR}/confirm-email`, {
        code: await lastEmailedCode(),
      });
      const token = await signIn(user);
      for (let attempt = 0; attempt < ATTEMPTS_PER_CHALLENGE; attempt++) {
        await verify(token, "backup", WRONG_BACKUP_CODE);
      }
      await allowNextEmailCode(user.userId);

      const response = await createClient().post(
        "/api/auth/request-2fa-email",
        { token },
      );
      expect(response.status).to.equal(HTTP_TOO_MANY_REQUESTS);
      expect(JSON.stringify(response.data)).to.include(
        "error.too_many_2fa_attempts",
      );
    });

    it("stores the emailed code hashed, and signs in with it once", async () => {
      await startEmailSetup();
      await client.post(`${TWO_FACTOR}/confirm-email`, {
        code: await lastEmailedCode(),
      });
      await allowNextEmailCode(user.userId);
      const token = await signIn(user);
      const requested = await createClient().post(
        "/api/auth/request-2fa-email",
        { token },
      );
      expect(requested.status, JSON.stringify(requested.data)).to.equal(
        HTTP_OK,
      );
      const code = await lastEmailedCode();

      const stored = (await storedUser(user.userId)).twoFactorEmailCode;
      expect(stored).to.match(SHA256_HEX);
      expect(stored).to.not.equal(code);

      expect((await verify(token, "email", code)).status).to.equal(HTTP_OK);
      expect((await verify(token, "email", code)).status).to.equal(
        HTTP_UNAUTHORIZED,
      );
    });
  });

  describe("authenticator codes", () => {
    it("refuses a code already accepted, at sign-in and on the Security page", async () => {
      const { code } = await enableTotp(client, user);

      expect((await verify(await signIn(user), "totp", code)).status).to.equal(
        HTTP_UNAUTHORIZED,
      );
      const regenerated = await client.post(`${TWO_FACTOR}/regenerate-backup`, {
        code,
      });
      expect(regenerated.status).to.equal(HTTP_UNAUTHORIZED);
      const disabled = await client.post(`${TWO_FACTOR}/disable`, {
        method: "totp",
        code,
      });
      expect(disabled.status).to.equal(HTTP_UNAUTHORIZED);
      expect(await methods()).to.include("totp");
    });

    it("accepts a later code once, and never an earlier one", async () => {
      const { secret } = await enableTotp(client, user);
      const userModel = GetModel(UserModel);
      const later = Date.now() + 10 * TOTP_STEP_MS;
      const laterCode = generateCode(secret, totpStepAt(later));
      const earlier = Date.now() + 5 * TOTP_STEP_MS;
      const earlierCode = generateCode(secret, totpStepAt(earlier));

      const accept = async (code: string, now: number) =>
        acceptTotpCode(
          userModel,
          await storedUser(user.userId),
          secret,
          code,
          now,
        );
      expect(await accept(laterCode, later)).to.equal(true);
      expect(await accept(laterCode, later)).to.equal(false);
      expect(await accept(earlierCode, earlier)).to.equal(false);
      // The step is written alone, not through the whole row: the rest of
      // the account, its password included, is left as it was.
      expect(await signIn(user)).to.be.a("string");
    });

    it("lets only one of two concurrent uses of a code through", async () => {
      const { secret } = await enableTotp(client, user);
      const userModel = GetModel(UserModel);
      const later = Date.now() + 3 * TOTP_STEP_MS;
      const code = generateCode(secret, totpStepAt(later));
      const [first, second] = await Promise.all([
        storedUser(user.userId),
        storedUser(user.userId),
      ]);

      const outcomes = await Promise.all([
        acceptTotpCode(userModel, first, secret, code, later),
        acceptTotpCode(userModel, second, secret, code, later),
      ]);
      expect(outcomes.filter(Boolean)).to.have.length(1);
    });
  });

  describe("turning email codes on", () => {
    it("waits for the code sent to the account address", async () => {
      const started = await startEmailSetup();
      expect(started.status, JSON.stringify(started.data)).to.equal(HTTP_OK);
      expect(await methods()).to.not.include("email");
      const code = await lastEmailedCode();
      const wrong = code === "000000" ? "000001" : "000000";

      const refused = await client.post(`${TWO_FACTOR}/confirm-email`, {
        code: wrong,
      });
      expect(refused.status).to.equal(HTTP_UNAUTHORIZED);
      expect(await methods()).to.not.include("email");

      const confirmed = await client.post(`${TWO_FACTOR}/confirm-email`, {
        code,
      });
      expect(confirmed.status, JSON.stringify(confirmed.data)).to.equal(
        HTTP_OK,
      );
      expect(confirmed.data.backupCodes).to.have.length.greaterThan(0);
      expect(await methods()).to.include("email");
    });

    it("refuses a confirmation that no setup started", async () => {
      const response = await client.post(`${TWO_FACTOR}/confirm-email`, {
        code: "123456",
      });
      expect(response.status).to.equal(HTTP_BAD_REQUEST);
      expect(await methods()).to.not.include("email");
    });

    it("resends the code of a setup in progress, and only then", async () => {
      const unstarted = await client.post(`${TWO_FACTOR}/request-email-code`);
      expect(unstarted.status).to.equal(HTTP_BAD_REQUEST);

      await startEmailSetup();
      const first = await lastEmailedCode();
      await allowNextEmailCode(user.userId);
      const resent = await client.post(`${TWO_FACTOR}/request-email-code`);
      expect(resent.status, JSON.stringify(resent.data)).to.equal(HTTP_OK);
      const second = await lastEmailedCode();

      if (first !== second) {
        const stale = await client.post(`${TWO_FACTOR}/confirm-email`, {
          code: first,
        });
        expect(stale.status).to.equal(HTTP_UNAUTHORIZED);
      }
      const confirmed = await client.post(`${TWO_FACTOR}/confirm-email`, {
        code: second,
      });
      expect(confirmed.status).to.equal(HTTP_OK);
    });
  });
});

import { GetModel } from "@antelopejs/interface-database-decorators";
import { SessionModel, UserModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  authorizedClient,
  loginUser,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

// "Forgot password" mails a 6-character code. A code takes a bounded number
// of tries, whatever the case it is typed in, and setting the new password
// signs out every session, as a password change does.

const NEW_PASSWORD = "Recovered26!";
const WRONG_CODE = "000000";
const MAX_ATTEMPTS = 5;
const PARALLEL_GUESSES = 12;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_MULTIPLE_CHOICES = 300;
const PAST_RATE_LIMIT_MS = 2 * 60 * 1000;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function requestCode(email: string): Promise<string> {
  const response = await createClient().post("/api/auth/forgot-password", {
    email,
  });
  expect(response.status).to.be.below(HTTP_MULTIPLE_CHOICES);
  const user = await GetModel(UserModel).getByEmail(email);
  expect(user?.forgotPasswordToken).to.be.a("string");
  return user?.forgotPasswordToken as string;
}

function validateCode(email: string, token: string) {
  return createClient().post("/api/auth/validate-forgot-password-token", {
    email,
    token,
  });
}

function resetPassword(email: string, token: string) {
  return createClient().post("/api/auth/reset-password", {
    email,
    token,
    password: NEW_PASSWORD,
  });
}

async function storedCode(email: string): Promise<string | null | undefined> {
  return (await GetModel(UserModel).getByEmail(email))?.forgotPasswordToken;
}

async function meStatus(accessToken: string): Promise<number> {
  return (await authorizedClient(accessToken).get("/api/auth/me")).status;
}

async function refreshStatus(refreshToken: string): Promise<number> {
  const response = await createClient().post("/api/auth/refresh", {
    token: refreshToken,
  });
  return response.status;
}

async function expectSignedOut(device: TokenPair): Promise<void> {
  expect(await meStatus(device.accessToken)).to.equal(HTTP_UNAUTHORIZED);
  expect(await refreshStatus(device.refreshToken)).to.equal(HTTP_UNAUTHORIZED);
}

describe("[integration] auth/password reset", () => {
  let user: RegisteredUser;

  beforeEach(async () => {
    await resetDatabase();
    user = await registerUser();
  });

  it("signs out every session once the password is reset", async () => {
    const otherDevice = await loginUser(user.email, user.password);
    const code = await requestCode(user.email);

    const response = await resetPassword(user.email, code);
    expect(response.status, JSON.stringify(response.data)).to.be.below(
      HTTP_MULTIPLE_CHOICES,
    );

    await expectSignedOut(user);
    await expectSignedOut(otherDevice);
    expect(
      await GetModel(SessionModel).getByUserId(user.userId),
    ).to.have.length(0);
    const signedIn = await loginUser(user.email, NEW_PASSWORD);
    expect(await meStatus(signedIn.accessToken)).to.be.below(
      HTTP_MULTIPLE_CHOICES,
    );
  });

  it("accepts the code typed in lowercase", async () => {
    const code = (await requestCode(user.email)).toLowerCase();

    const validated = await validateCode(user.email, code);
    expect(validated.status, JSON.stringify(validated.data)).to.be.below(
      HTTP_MULTIPLE_CHOICES,
    );
    const reset = await resetPassword(user.email, code);
    expect(reset.status, JSON.stringify(reset.data)).to.be.below(
      HTTP_MULTIPLE_CHOICES,
    );
  });

  describe("attempt limit", () => {
    it("still takes the right code after one try fewer than the limit", async () => {
      const code = await requestCode(user.email);
      for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
        expect((await validateCode(user.email, WRONG_CODE)).status).to.equal(
          HTTP_BAD_REQUEST,
        );
      }

      expect((await validateCode(user.email, code)).status).to.be.below(
        HTTP_MULTIPLE_CHOICES,
      );
      expect((await resetPassword(user.email, code)).status).to.be.below(
        HTTP_MULTIPLE_CHOICES,
      );
    });

    it("withdraws the code after too many wrong ones", async () => {
      const code = await requestCode(user.email);
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        expect((await validateCode(user.email, WRONG_CODE)).status).to.equal(
          HTTP_BAD_REQUEST,
        );
      }

      expect((await validateCode(user.email, code)).status).to.equal(
        HTTP_BAD_REQUEST,
      );
      expect((await resetPassword(user.email, code)).status).to.equal(
        HTTP_BAD_REQUEST,
      );
      expect(await storedCode(user.email)).to.equal(null);
      expect(await loginUser(user.email, user.password)).to.have.property(
        "accessToken",
      );
    });

    it("counts wrong codes sent at the same time against one budget", async () => {
      const code = await requestCode(user.email);
      await Promise.all(
        Array.from({ length: PARALLEL_GUESSES }, () =>
          validateCode(user.email, WRONG_CODE),
        ),
      );

      expect((await resetPassword(user.email, code)).status).to.equal(
        HTTP_BAD_REQUEST,
      );
    });

    it("lets a new code be requested once the previous one was withdrawn", async () => {
      await requestCode(user.email);
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await validateCode(user.email, WRONG_CODE);
      }
      await GetModel(UserModel).update(user.userId, {
        forgotPasswordRequestedAt: new Date(Date.now() - PAST_RATE_LIMIT_MS),
      });

      const code = await requestCode(user.email);
      expect((await resetPassword(user.email, code)).status).to.be.below(
        HTTP_MULTIPLE_CHOICES,
      );
    });

    it("refuses a withdrawn code as it refuses an unknown address", async () => {
      await requestCode(user.email);
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await validateCode(user.email, WRONG_CODE);
      }

      const withdrawn = await validateCode(user.email, WRONG_CODE);
      const unknown = await validateCode("nobody@test.local", WRONG_CODE);
      expect(withdrawn.status).to.equal(unknown.status);
      expect(withdrawn.data).to.deep.equal(unknown.data);
    });
  });
});

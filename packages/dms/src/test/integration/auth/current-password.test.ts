import type { AxiosInstance, AxiosResponse } from "axios";
import { expect } from "chai";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { captureEmails } from "../../helpers/emails";

// The account password asked again by a signed-in session gets the sign-in
// form's budget of tries, shared by every form that asks for it, so a
// borrowed session cannot guess it any faster than the sign-in form allows.

const SECURITY = "/settings/user/security";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const ATTEMPTS_PER_WINDOW = 10;
const WRONG_PASSWORD = "Not-the-password-1";
const NEW_PASSWORD = "Antelope26!";
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
const TOO_MANY_ATTEMPTS = "error.too_many_current_password_attempts";
const EMAIL_RATE_LIMITED = "error.rate_limited";
// A dozen password checks, each hashing, outlast mocha's default.
const TEST_TIMEOUT_MS = 20 * 1000;

function expectAnswer(
  response: AxiosResponse,
  status: number,
  body: string,
): void {
  expect(response.status, JSON.stringify(response.data)).to.equal(status);
  expect(response.data).to.equal(body);
}

describe("[integration] auth/current password re-check", function () {
  this.timeout(TEST_TIMEOUT_MS);

  let user: RegisteredUser;
  let client: AxiosInstance;
  let newEmail: string;

  const changeEmail = (currentPassword: string) =>
    client.post(`${SECURITY}/email`, { email: newEmail, currentPassword });
  const changePassword = (currentPassword: string) =>
    client.post(`${SECURITY}/password`, {
      currentPassword,
      password: NEW_PASSWORD,
    });
  const enableTotp = (currentPassword: string) =>
    client.post(`${SECURITY}/two-factor/enable-totp`, { currentPassword });

  // An accepted email change sends its code and notice.
  before(captureEmails);

  beforeEach(async () => {
    await resetDatabase();
    user = await registerUser({ owner: true });
    client = authorizedClient(user.accessToken);
    newEmail = `moved-${Date.now()}@test.local`;
  });

  it("refuses every re-check past 10 wrong passwords, across the forms, the right one included", async () => {
    for (let attempt = 0; attempt < ATTEMPTS_PER_WINDOW / 2; attempt++) {
      expectAnswer(
        await changeEmail(WRONG_PASSWORD),
        HTTP_BAD_REQUEST,
        INVALID_CURRENT_PASSWORD,
      );
      expectAnswer(
        await changePassword(WRONG_PASSWORD),
        HTTP_BAD_REQUEST,
        INVALID_CURRENT_PASSWORD,
      );
    }
    for (const check of [changePassword, changeEmail, enableTotp]) {
      expectAnswer(
        await check(user.password),
        HTTP_TOO_MANY_REQUESTS,
        TOO_MANY_ATTEMPTS,
      );
    }
  });

  it("forgets the wrong passwords once the right one is given", async () => {
    for (let attempt = 1; attempt < ATTEMPTS_PER_WINDOW; attempt++) {
      await changePassword(WRONG_PASSWORD);
    }
    const accepted = await enableTotp(user.password);
    expect(accepted.status, JSON.stringify(accepted.data)).to.equal(HTTP_OK);
    for (let attempt = 0; attempt < ATTEMPTS_PER_WINDOW; attempt++) {
      expectAnswer(
        await changePassword(WRONG_PASSWORD),
        HTTP_BAD_REQUEST,
        INVALID_CURRENT_PASSWORD,
      );
    }
  });

  it("answers the once-a-minute wait of the email change before checking the password", async () => {
    const first = await changeEmail(user.password);
    expect(first.status, JSON.stringify(first.data)).to.equal(HTTP_OK);
    expectAnswer(
      await changeEmail(WRONG_PASSWORD),
      HTTP_TOO_MANY_REQUESTS,
      EMAIL_RATE_LIMITED,
    );
  });
});

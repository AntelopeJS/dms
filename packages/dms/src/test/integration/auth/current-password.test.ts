import { GetModel } from "@antelopejs/interface-database-decorators";
import { SessionModel } from "@antelopejs/interface-dms/auth/db";
import type { AxiosInstance, AxiosResponse } from "axios";
import { expect } from "chai";
import { UserNotificationsModel } from "../../../db";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { captureEmails } from "../../helpers/emails";
import { findUserByEmail } from "../../helpers/fixtures";
import { pageRoutePath } from "@antelopejs/interface-dms/page";

const SECURITY = pageRoutePath("/settings/user/security");
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const ATTEMPTS_PER_WINDOW = 10;
const WRONG_PASSWORD = "Not-the-password-1";
const NEW_PASSWORD = "Antelope26!";
const WEAK_PASSWORD = "antelope";
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
const TOO_MANY_ATTEMPTS = "error.too_many_current_password_attempts";
const EMAIL_RATE_LIMITED = "error.rate_limited";

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

  /**
   * What the account, its sessions and its notifications hold. The account's
   * activity stamps move on every authenticated request, so they are left out.
   */
  const storedState = async () => {
    const {
      lastActiveAt: _lastActiveAt,
      updatedAt: _updatedAt,
      ...account
    } = await findUserByEmail(user.email);
    return {
      account,
      sessions: await GetModel(SessionModel).getByUserId(user.userId),
      notifications: await GetModel(UserNotificationsModel).getByUserId(
        user.userId,
      ),
    };
  };

  before(captureEmails);

  beforeEach(async () => {
    await resetDatabase();
    user = await registerUser({ owner: true });
    client = authorizedClient(user.accessToken);
    newEmail = `moved-${Date.now()}@test.local`;
  });

  it("enforces the sign-up password rules on a new password", async () => {
    const before = await storedState();
    const weak = await client.post(`${SECURITY}/password`, {
      currentPassword: user.password,
      password: WEAK_PASSWORD,
    });
    expect(weak.status, JSON.stringify(weak.data)).to.equal(HTTP_BAD_REQUEST);
    expect(
      await storedState(),
      "a refused password writes nothing",
    ).to.deep.equal(before);

    const strong = await changePassword(user.password);
    expect(strong.status, JSON.stringify(strong.data)).to.equal(HTTP_OK);
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

import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { captureEmails } from "../../helpers/emails";

// Adding a second factor asks for the account password, and the profile's
// copies of the two-factor routes, which asked for nothing, are gone.

const TWO_FACTOR = "/settings/user/security/two-factor";
const LEGACY_TWO_FACTOR = "/settings/user/profile/two-factor";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
// Adding email codes now sends the first one, which takes longer than
// mocha's default on CI runners (as in two-factor-codes.test.ts).
const TEST_TIMEOUT_MS = 20 * 1000;

describe("[integration] auth/adding a two-factor method", function () {
  this.timeout(TEST_TIMEOUT_MS);

  let user: RegisteredUser;
  let client: AxiosInstance;

  // Adding email codes sends the first one.
  before(captureEmails);

  beforeEach(async () => {
    await resetDatabase();
    user = await registerUser({ owner: true });
    client = authorizedClient(user.accessToken);
  });

  for (const route of ["enable-totp", "enable-email"]) {
    it(`refuses ${route} without the current password, or with a wrong one`, async () => {
      for (const body of [{}, { currentPassword: "Not-the-password-1" }]) {
        const response = await client.post(`${TWO_FACTOR}/${route}`, body);
        expect(response.status).to.equal(HTTP_BAD_REQUEST);
        expect(JSON.stringify(response.data)).to.include(
          INVALID_CURRENT_PASSWORD,
        );
      }
    });

    it(`accepts ${route} with the current password`, async () => {
      const response = await client.post(`${TWO_FACTOR}/${route}`, {
        currentPassword: user.password,
      });
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    });

    it(`no longer serves ${route} under the profile`, async () => {
      const response = await client.post(`${LEGACY_TWO_FACTOR}/${route}`, {});
      expect(response.status).to.equal(HTTP_NOT_FOUND);
    });
  }
});

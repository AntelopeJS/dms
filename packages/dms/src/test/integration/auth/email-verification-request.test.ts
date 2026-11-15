import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { assert, expect } from "chai";
import { applyConfig, getAuthConfig } from "../../../config";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { captureEmailsInSuite, sentEmails } from "../../helpers/emails";

const ROUTE = "/api/auth/request-email-verification";
const HTTP_MULTIPLE_CHOICES = 300;

async function storedUser(userId: string) {
  const user = await GetModel(UserModel).get(userId);
  assert.exists(user);
  return user;
}

describe("[integration] auth/email verification request", () => {
  const initialAuth = getAuthConfig();
  let user: RegisteredUser;

  captureEmailsInSuite();
  before(() =>
    applyConfig({ auth: { ...initialAuth, mustValidateEmail: true } }),
  );
  after(() => applyConfig({ auth: initialAuth }));

  beforeEach(async () => {
    await resetDatabase();
    user = await registerUser();
    const stored = await storedUser(user.userId);
    stored.isValidated = false;
    stored.validationToken = null;
    stored.validationRequestedAt = null;
    await GetModel(UserModel).update(stored);
    sentEmails.length = 0;
  });

  it("issues no code and sends no mail on a GET, which a page's load could send with the user's session", async () => {
    await authorizedClient(user.accessToken).get(ROUTE);
    const stored = await storedUser(user.userId);
    expect(stored.validationRequestedAt ?? null).to.equal(null);
    expect(sentEmails).to.have.length(0);
  });

  it("issues a code and mails it on a POST", async () => {
    const response = await authorizedClient(user.accessToken).post(ROUTE);
    expect(response.status).to.be.below(HTTP_MULTIPLE_CHOICES);
    const stored = await storedUser(user.userId);
    assert.instanceOf(stored.validationRequestedAt, Date);
    assert.isString(stored.validationToken);
    expect(sentEmails).to.have.length(1);
  });
});

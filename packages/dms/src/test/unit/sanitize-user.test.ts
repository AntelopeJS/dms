import { expect } from "chai";
import { sanitizeUser } from "../../implementations/dms-auth";
import { userFixture } from "../helpers/user-fixture";

describe("[unit] dms-auth — sanitizeUser", () => {
  it("drops the authenticator secrets and its last accepted step", () => {
    const user = userFixture({
      _id: "sanitize-user",
      email: "sanitize@example.com",
      twoFactorSecret: "confirmed-secret",
      twoFactorPendingSecret: "pending-secret",
      twoFactorTotpLastStep: 59_000_000,
    });

    const sanitized = sanitizeUser(user);

    expect(sanitized).to.not.have.property("twoFactorSecret");
    expect(sanitized).to.not.have.property("twoFactorPendingSecret");
    expect(sanitized).to.not.have.property("twoFactorTotpLastStep");
    expect(sanitized.email).to.equal("sanitize@example.com");
  });
});

import type { User } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import { sanitizeUser } from "../../implementations/dms-auth";

describe("[unit] dms-auth — sanitizeUser", () => {
  it("drops the authenticator secrets and its last accepted step", () => {
    const user = {
      _id: "sanitize-user",
      email: "sanitize@example.com",
      twoFactorSecret: "confirmed-secret",
      twoFactorPendingSecret: "pending-secret",
      twoFactorTotpLastStep: 59_000_000,
    } as unknown as User;

    const sanitized = sanitizeUser(user);

    expect(sanitized).to.not.have.property("twoFactorSecret");
    expect(sanitized).to.not.have.property("twoFactorPendingSecret");
    expect(sanitized).to.not.have.property("twoFactorTotpLastStep");
    expect(sanitized.email).to.equal("sanitize@example.com");
  });
});

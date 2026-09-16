import { expect } from "chai";
import { authSchema } from "../../../validation/auth.schema";

describe("[unit] validation/auth.schema", () => {
  describe("login", () => {
    it("accepts a valid login payload", () => {
      const result = authSchema.login.safeParse({
        email: "user@test.local",
        password: "any-password",
      });
      expect(result.success).to.equal(true);
    });

    it("rejects an invalid email", () => {
      const result = authSchema.login.safeParse({
        email: "not-an-email",
        password: "any-password",
      });
      expect(result.success).to.equal(false);
    });

    it("rejects a missing password", () => {
      const result = authSchema.login.safeParse({
        email: "user@test.local",
      });
      expect(result.success).to.equal(false);
    });
  });

  describe("signup", () => {
    const validPayload = {
      name: "Alice",
      email: "alice@test.local",
      password: "StrongP@ss1",
      lang: "en",
      token: "invite-token",
    };

    it("accepts a valid signup payload", () => {
      const result = authSchema.signup.safeParse(validPayload);
      expect(result.success).to.equal(true);
    });

    it("rejects a password without uppercase, digit or special char", () => {
      const result = authSchema.signup.safeParse({
        ...validPayload,
        password: "weakpassword",
      });
      expect(result.success).to.equal(false);
    });

    it("rejects a password shorter than 8 characters", () => {
      const result = authSchema.signup.safeParse({
        ...validPayload,
        password: "Ab@1",
      });
      expect(result.success).to.equal(false);
    });
  });

  describe("verify2FA", () => {
    it("rejects an unknown method", () => {
      const result = authSchema.verify2FA.safeParse({
        token: "t",
        code: "123456",
        method: "sms",
      });
      expect(result.success).to.equal(false);
    });

    it("accepts totp / email / backup", () => {
      const methods = ["totp", "email", "backup"] as const;
      for (const method of methods) {
        const result = authSchema.verify2FA.safeParse({
          token: "t",
          code: "123456",
          method,
        });
        expect(result.success, `method=${method}`).to.equal(true);
      }
    });
  });
});

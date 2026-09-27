import { expect } from "chai";
import {
  PASSWORD_ALLOWED_SPECIAL_CHARS,
  PASSWORD_MIN_LENGTH,
  isPasswordCompliant,
} from "@antelopejs/interface-dms/auth/password";

const COMPLIANT_PASSWORD = "StrongP@ss1";

describe("[unit] auth/password policy", () => {
  it("requires at least 8 characters", () => {
    expect(PASSWORD_MIN_LENGTH).to.equal(8);
  });

  it("accepts a password meeting every rule", () => {
    expect(isPasswordCompliant(COMPLIANT_PASSWORD)).to.equal(true);
  });

  it("accepts a password of exactly the minimum length", () => {
    expect(isPasswordCompliant("Abcdef1@")).to.equal(true);
  });

  it("accepts every allowed special character", () => {
    for (const special of PASSWORD_ALLOWED_SPECIAL_CHARS) {
      expect(isPasswordCompliant(`Abcdef1${special}`), special).to.equal(true);
    }
  });

  it("rejects a password shorter than the minimum length", () => {
    expect(isPasswordCompliant("Abcde1@")).to.equal(false);
  });

  it("rejects a password without an uppercase letter", () => {
    expect(isPasswordCompliant("weakp@ss1")).to.equal(false);
  });

  it("rejects a password without a digit", () => {
    expect(isPasswordCompliant("Weakpass@")).to.equal(false);
  });

  it("rejects a password without a special character", () => {
    expect(isPasswordCompliant("Weakpass1")).to.equal(false);
  });

  it("rejects a character outside the allowed set", () => {
    expect(isPasswordCompliant("StrongP@ss1#")).to.equal(false);
    expect(isPasswordCompliant("StrongP@ss1 ")).to.equal(false);
    expect(isPasswordCompliant("StrongP@ss1é")).to.equal(false);
  });

  it("rejects an empty password", () => {
    expect(isPasswordCompliant("")).to.equal(false);
  });
});

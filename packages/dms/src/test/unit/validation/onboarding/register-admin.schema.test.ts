import { expect } from "chai";
import { onboardingRegisterAdminSchema } from "../../../../validation/onboarding/register-admin.schema";

const validPayload = {
  email: "admin@test.local",
  firstName: "Camille",
  lastName: "Laurent",
  password: "StrongP@ss1",
};

describe("[unit] validation/onboarding/register-admin", () => {
  it("accepts a valid payload and joins the name parts", () => {
    const result = onboardingRegisterAdminSchema.safeParse(validPayload);
    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data.name).to.equal("Camille Laurent");
      expect(result.data).to.not.have.property("firstName");
    }
  });

  it("strips html tags from the email and the name parts", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      firstName: "<b>Camille</b>",
      lastName: " Laurent<script></script> ",
    });
    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data.name).to.equal("Camille Laurent");
    }
  });

  it("rejects a name part that is empty once its tags are stripped", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      lastName: "<i></i>",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a payload without a last name", () => {
    const { lastName: _lastName, ...payload } = validPayload;
    const result = onboardingRegisterAdminSchema.safeParse(payload);
    expect(result.success).to.equal(false);
  });

  it("keeps the platform details of the first step", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      platformName: " Acme <b>back office</b> ",
      language: "fr",
    });
    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data.platformName).to.equal("Acme back office");
      expect(result.data.language).to.equal("fr");
    }
  });

  it("treats a blank platform name as not given", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      platformName: "   ",
    });
    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data.platformName).to.equal(undefined);
      expect(result.data.language).to.equal(undefined);
    }
  });

  it("rejects a language that is not a language tag", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      language: "<script>",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects an invalid email", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      email: "not-an-email",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a password without an uppercase letter", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      password: "weakp@ss1",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a password without a digit", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      password: "Weakpass@",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a password without a special character", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      password: "Weakpass1",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a password shorter than 5 characters", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      password: "A@1",
    });
    expect(result.success).to.equal(false);
  });
});

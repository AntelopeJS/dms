import { expect } from "chai";
import { onboardingRegisterAdminSchema } from "../../../../validation/onboarding/register-admin.schema";

const validPayload = {
  email: "admin@test.local",
  name: "Admin",
  password: "StrongP@ss1",
};

describe("[unit] validation/onboarding/register-admin", () => {
  it("accepts a valid payload", () => {
    const result = onboardingRegisterAdminSchema.safeParse(validPayload);
    expect(result.success).to.equal(true);
  });

  it("strips html tags from email and name", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      email: "admin@test.local",
      name: "<b>Admin</b>",
      password: "StrongP@ss1",
    });
    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data.name).to.equal("Admin");
    }
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

  it("rejects an empty name", () => {
    const result = onboardingRegisterAdminSchema.safeParse({
      ...validPayload,
      name: "",
    });
    expect(result.success).to.equal(false);
  });
});

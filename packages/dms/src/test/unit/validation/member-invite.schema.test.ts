import { expect } from "chai";
import {
  INVITE_NAME_MAX_LENGTH,
  memberInviteSchema,
} from "../../../validation/member-invite.schema";

const basePayload = {
  email: "invitee@test.local",
  roles: ["role-1"],
  language: "en",
  asTenantOwner: false,
};

describe("[unit] validation/member-invite.schema", () => {
  it("accepts a payload without names when email validation is not skipped", () => {
    const result = memberInviteSchema.safeParse(basePayload);
    expect(result.success).to.equal(true);
  });

  it("accepts optional names when email validation is not skipped", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      firstname: "Ada",
      lastname: "Lovelace",
    });
    expect(result.success).to.equal(true);
  });

  it("rejects a payload without names when email validation is skipped", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      skipEmailValidation: true,
    });
    expect(result.success).to.equal(false);
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).to.include("firstname");
    expect(paths).to.include("lastname");
  });

  it("rejects a missing lastname alone when email validation is skipped", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      skipEmailValidation: true,
      firstname: "Ada",
    });
    expect(result.success).to.equal(false);
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).to.deep.equal(["lastname"]);
  });

  it("accepts names with skipped email validation", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      skipEmailValidation: true,
      firstname: "Ada",
      lastname: "Lovelace",
    });
    expect(result.success).to.equal(true);
  });

  it("accepts an empty firstname when email validation is not skipped", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      firstname: "",
    });
    expect(result.success).to.equal(true);
  });

  it("rejects an empty firstname when email validation is skipped", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      skipEmailValidation: true,
      firstname: "",
      lastname: "Lovelace",
    });
    expect(result.success).to.equal(false);
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).to.deep.equal(["firstname"]);
  });

  it("still requires at least one role for non-owners", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      roles: [],
    });
    expect(result.success).to.equal(false);
  });
  it("treats a whitespace-only name as missing when validation is skipped", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      skipEmailValidation: true,
      firstname: "   ",
      lastname: "Lovelace",
    });
    expect(result.success).to.equal(false);
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).to.deep.equal(["firstname"]);
  });

  it("trims the names it accepts", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      firstname: "  Ada  ",
      lastname: " Lovelace ",
    });
    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data.firstname).to.equal("Ada");
      expect(result.data.lastname).to.equal("Lovelace");
    }
  });

  it("rejects a name past the bound the invite form mirrors", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      firstname: "a".repeat(INVITE_NAME_MAX_LENGTH + 1),
    });
    expect(result.success).to.equal(false);
  });
});

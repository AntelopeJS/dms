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
  it("accepts a payload without names", () => {
    const result = memberInviteSchema.safeParse(basePayload);
    expect(result.success).to.equal(true);
  });

  it("accepts optional names", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      firstname: "Ada",
      lastname: "Lovelace",
    });
    expect(result.success).to.equal(true);
  });

  it("accepts an empty firstname", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      firstname: "",
    });
    expect(result.success).to.equal(true);
  });

  // An invite signup always validates the address: a caller still sending the
  // retired switch gets neither the names nor the single address it imposed.
  it("ignores a retired skipEmailValidation flag", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      emails: ["ada@test.local", "grace@test.local"],
      skipEmailValidation: true,
    });
    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data).to.not.have.property("skipEmailValidation");
    }
  });

  it("still requires at least one role for non-owners", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      roles: [],
    });
    expect(result.success).to.equal(false);
  });

  it("trims a whitespace-only name to nothing", () => {
    const result = memberInviteSchema.safeParse({
      ...basePayload,
      firstname: "   ",
    });
    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data.firstname).to.equal("");
    }
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

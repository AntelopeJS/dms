import { expect } from "chai";
import { userNotificationPreferencesSchema } from "../../../validation/user-notification-preferences.schema";

describe("[unit] validation/user-notification-preferences", () => {
  it("accepts an empty record", () => {
    const result = userNotificationPreferencesSchema.safeParse({});
    expect(result.success).to.equal(true);
  });

  it("accepts a record of boolean flags", () => {
    const result = userNotificationPreferencesSchema.safeParse({
      email_marketing: true,
      email_security: false,
      push_updates: true,
    });
    expect(result.success).to.equal(true);
  });

  it("rejects a non-boolean value", () => {
    const result = userNotificationPreferencesSchema.safeParse({
      email_marketing: "yes",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a non-object payload", () => {
    const result = userNotificationPreferencesSchema.safeParse("notifications");
    expect(result.success).to.equal(false);
  });
});

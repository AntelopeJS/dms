import { expect } from "chai";
import {
  notificationIdsSchema,
  userNotificationPreferencesPatchSchema,
  userNotificationPreferencesSchema,
} from "../../../validation/user-notification-preferences.schema";

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

describe("[unit] validation/user-notification-preferences — patch and ids", () => {
  it("refuses an empty patch", () => {
    const result = userNotificationPreferencesPatchSchema.safeParse({});
    expect(result.success).to.equal(false);
  });

  it("accepts a one-subject patch", () => {
    const result = userNotificationPreferencesPatchSchema.safeParse({
      "system:account": false,
    });
    expect(result.success).to.equal(true);
  });

  it("requires a non-empty list of ids", () => {
    expect(notificationIdsSchema.safeParse({ ids: [] }).success).to.equal(
      false,
    );
    expect(notificationIdsSchema.safeParse({ ids: ["a"] }).success).to.equal(
      true,
    );
  });
});

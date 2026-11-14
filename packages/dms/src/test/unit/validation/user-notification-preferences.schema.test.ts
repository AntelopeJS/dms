import { expect } from "chai";
import { userNotificationPreferencesPatchSchema } from "../../../validation";

describe("[unit] validation/user-notification-preferences — patch", () => {
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
});

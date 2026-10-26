import { expect } from "chai";
import { hasNotificationTitle } from "../../../../implementations/dms-notifications/delivery-guard";

describe("[unit] implementations/dms-notifications/delivery-guard", () => {
  it("delivers a notification with a title", () => {
    expect(
      hasNotificationTitle({ title: "$dms.notifications.x.title" }),
    ).to.equal(true);
  });

  it("refuses an empty or blank title", () => {
    expect(hasNotificationTitle({ title: "" })).to.equal(false);
    expect(hasNotificationTitle({ title: "   " })).to.equal(false);
  });

  it("refuses a missing title a request body passed through", () => {
    const fromBody: Parameters<typeof hasNotificationTitle>[0] =
      JSON.parse('{"title":null}');
    const withoutTitle: Parameters<typeof hasNotificationTitle>[0] =
      JSON.parse("{}");
    expect(hasNotificationTitle(fromBody)).to.equal(false);
    expect(hasNotificationTitle(withoutTitle)).to.equal(false);
  });
});

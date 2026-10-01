import { expect } from "chai";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  applyRegionalPreferences,
  readRegionalPreferences,
} from "../../../../pages/settings/users/regional-preferences";
import { regionalPreferencesSchema } from "../../../../validation/regional-preferences.schema";

const PASSWORD_HASH = "$2b$10$kept-hash";

function storedUser(): User {
  return {
    _id: "regional-user",
    email: "ada@acme.dev",
    name: "Ada",
    language: "en",
    password: PASSWORD_HASH,
    timeZone: "Asia/Tokyo",
  } as unknown as User;
}

describe("[unit] regional preferences — validation", () => {
  it("accepts IANA zones, the three week starts and both clocks", () => {
    expect(
      regionalPreferencesSchema.parse({
        timeZone: "America/Argentina/Buenos_Aires",
        weekStart: 6,
        timeFormat: "h12",
        dateFormat: "text",
      }),
    ).to.deep.equal({
      timeZone: "America/Argentina/Buenos_Aires",
      weekStart: 6,
      timeFormat: "h12",
      dateFormat: "text",
    });
    expect(regionalPreferencesSchema.parse({ timeZone: null })).to.deep.equal({
      timeZone: null,
    });
  });

  it("refuses unknown zones, other weekdays and unknown fields", () => {
    expect(
      regionalPreferencesSchema.safeParse({ timeZone: "Mars/Olympus" }).success,
    ).to.equal(false);
    expect(
      regionalPreferencesSchema.safeParse({ weekStart: 3 }).success,
    ).to.equal(false);
    expect(
      regionalPreferencesSchema.safeParse({ password: "x" }).success,
    ).to.equal(false);
  });
});

describe("[unit] regional preferences — saving onto the user row", () => {
  it("changes the fields the body names and keeps the rest of the row", () => {
    const user = storedUser();
    applyRegionalPreferences(user, { weekStart: 0, timeFormat: null });
    expect(user.password).to.equal(PASSWORD_HASH);
    expect(user.timeZone).to.equal("Asia/Tokyo");
    expect(readRegionalPreferences(user)).to.deep.equal({
      language: "en",
      timeZone: "Asia/Tokyo",
      weekStart: 0,
      timeFormat: null,
      dateFormat: null,
    });
  });

  it("puts a preference back on automatic with null", () => {
    const user = storedUser();
    applyRegionalPreferences(user, { timeZone: null, language: "fr" });
    expect(user.timeZone).to.equal(null);
    expect(user.language).to.equal("fr");
  });
});

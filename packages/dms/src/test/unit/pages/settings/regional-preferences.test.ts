import { expect } from "chai";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  AUTOMATIC_PREFERENCE,
  applyRegionalPreferences,
  fromRegionFormValues,
  readRegionalPreferences,
  toRegionFormValues,
} from "../../../../pages/settings/users/regional-preferences";
import type { FormPropsSerialized } from "@antelopejs/interface-dms/base/form-types";
import { regionPreferencesForm } from "../../../../pages/settings/users/region-form";
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

describe("[unit] regional preferences — the Language & region form", () => {
  it("shows an unset preference as automatic and keeps the language", () => {
    expect(
      toRegionFormValues({
        language: "fr",
        timeZone: "Asia/Tokyo",
        weekStart: null,
        timeFormat: "h12",
        dateFormat: null,
      }),
    ).to.deep.equal({
      language: "fr",
      timeZone: "Asia/Tokyo",
      weekStart: AUTOMATIC_PREFERENCE,
      timeFormat: "h12",
      dateFormat: AUTOMATIC_PREFERENCE,
    });
  });

  it("saves automatic as null, which the schema accepts", () => {
    const body = fromRegionFormValues({ weekStart: AUTOMATIC_PREFERENCE });
    expect(body).to.deep.equal({ weekStart: null });
    expect(regionalPreferencesSchema.parse(body)).to.deep.equal({
      weekStart: null,
    });
    expect(fromRegionFormValues({ language: "fr" })).to.deep.equal({
      language: "fr",
    });
  });

  it("carries the first day of the week as the text of its option", () => {
    expect(
      toRegionFormValues({
        language: "en",
        timeZone: null,
        weekStart: 1,
        timeFormat: null,
        dateFormat: null,
      }).weekStart,
    ).to.equal("1");
    const body = fromRegionFormValues({ weekStart: "6" });
    expect(regionalPreferencesSchema.parse(body)).to.deep.equal({
      weekStart: 6,
    });
  });

  it("is one instant form with a section per group", () => {
    const options = regionPreferencesForm().serializeSync()
      .options as FormPropsSerialized;
    expect(options?.saveMode).to.equal("instant");
    expect(options?.sections?.map((section) => section.id)).to.deep.equal([
      "language",
      "time",
    ]);
    expect(
      options?.sections?.flatMap((section) => section.fieldIds),
    ).to.deep.equal([
      "language",
      "timeZone",
      "weekStart",
      "timeFormat",
      "dateFormat",
    ]);
  });
});

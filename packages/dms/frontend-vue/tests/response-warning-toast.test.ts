import { describe, expect, it } from "vitest";
import {
  readResponseWarning,
  resolveResponseToast,
} from "../layers/dms-ui/app/build/utils/responseWarning";
import en from "../layers/dms-layout/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/i18n/locales/layout-fr-FR.json";
import uiEn from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import uiFr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";

const INVITE_EMAIL_FAILED = "$page.settings.members.invite.email_failed";
const SUCCESS = { color: "success", title: "Invitation sent successfully" };

const translation = {
  processI18n: (key: string) => `i18n:${key}`,
  processApiMessage: (message: unknown) => `api:${String(message)}`,
};

describe("response warning toast", () => {
  it("tells the warning instead of the success when the response carries one", () => {
    expect(
      resolveResponseToast(
        { redirectPath: "/invites", warning: INVITE_EMAIL_FAILED },
        SUCCESS,
        translation,
      ),
    ).toEqual({
      color: "warning",
      title: "i18n:$dms.form.warning_title",
      description: `api:${INVITE_EMAIL_FAILED}`,
    });
  });

  it("keeps the success toast for a plain success", () => {
    expect(
      resolveResponseToast({ emailDelivery: "sent" }, SUCCESS, translation),
    ).toBe(SUCCESS);
    expect(resolveResponseToast(undefined, SUCCESS, translation)).toBe(SUCCESS);
    expect(resolveResponseToast("", SUCCESS, translation)).toBe(SUCCESS);
  });

  it("ignores a warning that is not a message", () => {
    expect(readResponseWarning({ warning: "" })).toBeUndefined();
    expect(readResponseWarning({ warning: 42 })).toBeUndefined();
  });

  it("has the invitation warnings in every shipped locale", () => {
    for (const locale of [en, fr]) {
      const settings = locale.page.settings;
      expect(settings.members.invite.email_failed).toBeTruthy();
      expect(settings.invites.action.resend_email_failed).toBeTruthy();
    }
    for (const locale of [uiEn, uiFr]) {
      expect(locale.dms.form.warning_title).toBeTruthy();
    }
  });
});

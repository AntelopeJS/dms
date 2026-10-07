import { expect } from "chai";
import {
  DUPLICATE_WINDOW_MS,
  type DuplicateIdentity,
  duplicateIds,
  isWithinDuplicateWindow,
} from "../../../../implementations/dms-notifications/delivery-dedupe";

const SECURITY = { id: "security", labelKey: "security", icon: "i-ph-lock" };
const SIGN_IN_SUBJECT = {
  id: "sign-in",
  labelKey: "sign_in",
  category: SECURITY,
};
const SIGN_IN: DuplicateIdentity = {
  title: "$dms.notifications.messages.new_login.title_browser_os",
  description: "$dms.notifications.messages.new_login.description",
  params: { browser: "Firefox", os: "Windows", country: "France" },
  linkTo: "/settings/user/security",
  subject: SIGN_IN_SUBJECT,
  tone: "warning",
  icon: "i-ph-sign-in",
};
const WINDOW_START = new Date(
  1_700_000_000_000 - (1_700_000_000_000 % DUPLICATE_WINDOW_MS),
);
const HOUR_MS = 60 * 60 * 1000;

function at(offsetMs: number): Date {
  return new Date(WINDOW_START.getTime() + offsetMs);
}

describe("[unit] implementations/dms-notifications/delivery-dedupe", () => {
  it("gives the same id to the same notification within one window", () => {
    expect(duplicateIds("u1", SIGN_IN, at(0)).current).to.equal(
      duplicateIds("u1", SIGN_IN, at(DUPLICATE_WINDOW_MS - 1)).current,
    );
  });

  it("finds a copy sent just before the window turned under the previous id", () => {
    const before = duplicateIds("u1", SIGN_IN, at(-1));
    const after = duplicateIds("u1", SIGN_IN, at(1));
    expect(after.current).to.not.equal(before.current);
    expect(after.previous).to.equal(before.current);
    expect(isWithinDuplicateWindow(at(-1), at(1))).to.equal(true);
  });

  it("lets the same notification through an hour later", () => {
    const first = duplicateIds("u1", SIGN_IN, at(0));
    const later = duplicateIds("u1", SIGN_IN, at(HOUR_MS));
    expect([later.current, later.previous]).to.not.include(first.current);
    expect(isWithinDuplicateWindow(at(0), at(HOUR_MS))).to.equal(false);
  });

  it("tells apart a different category, subject, tone or icon", () => {
    const id = duplicateIds("u1", SIGN_IN, at(0)).current;
    const variants = [
      {
        ...SIGN_IN,
        subject: {
          ...SIGN_IN_SUBJECT,
          category: { ...SECURITY, id: "account" },
        },
      },
      { ...SIGN_IN, subject: { ...SIGN_IN_SUBJECT, id: "password" } },
      { ...SIGN_IN, tone: "error" as const },
      { ...SIGN_IN, icon: "i-ph-warning" },
    ];
    for (const variant of variants) {
      expect(duplicateIds("u1", variant, at(0)).current).to.not.equal(id);
    }
  });

  it("tells apart a different recipient, title, description, params or link", () => {
    const id = duplicateIds("u1", SIGN_IN, at(0)).current;
    const variants = [
      duplicateIds("u2", SIGN_IN, at(0)),
      duplicateIds("u1", { ...SIGN_IN, title: "Other" }, at(0)),
      duplicateIds("u1", { ...SIGN_IN, description: "Other" }, at(0)),
      duplicateIds(
        "u1",
        { ...SIGN_IN, params: { ...SIGN_IN.params, browser: "Chrome" } },
        at(0),
      ),
      duplicateIds("u1", { ...SIGN_IN, linkTo: "/settings" }, at(0)),
    ];
    for (const variant of variants) {
      expect(variant.current).to.not.equal(id);
    }
  });

  it("keeps a role editing session's saves apart: each carries its own time", () => {
    const save = (editedAt: number) => ({
      ...SIGN_IN,
      params: { role: "Editor", roleId: "r1", editedAt },
    });
    expect(duplicateIds("u1", save(1), at(0)).current).to.not.equal(
      duplicateIds("u1", save(2), at(0)).current,
    );
  });

  it("matches params whatever their key order, and no params with empty ones", () => {
    const reordered = {
      ...SIGN_IN,
      params: { country: "France", os: "Windows", browser: "Firefox" },
    };
    expect(duplicateIds("u1", reordered, at(0)).current).to.equal(
      duplicateIds("u1", SIGN_IN, at(0)).current,
    );
    const plain: DuplicateIdentity = {
      ...SIGN_IN,
      title: "Plain",
      description: "Text",
      linkTo: "",
      params: undefined,
    };
    expect(duplicateIds("u1", plain, at(0)).current).to.equal(
      duplicateIds("u1", { ...plain, params: {} }, at(0)).current,
    );
  });

  it("treats a copy from another instance's clock running ahead as recent", () => {
    expect(isWithinDuplicateWindow(at(2000), at(0))).to.equal(true);
    expect(isWithinDuplicateWindow(at(0), at(DUPLICATE_WINDOW_MS))).to.equal(
      false,
    );
  });
});

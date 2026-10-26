import { expect } from "chai";
import { GetAllHtmlTemplates } from "@antelopejs/interface-dms/html-render";

const BUILT_IN_EMAILS = [
  "EmailAdminInvite",
  "EmailChangeNotice",
  "EmailChangeVerification",
  "EmailExportReady",
  "EmailResetPassword",
  "EmailTwoFactor",
  "EmailUserValidation",
];

describe("[unit] implementations/dms-html-render — built-in emails", () => {
  it("registers every documented built-in email", async () => {
    const registered = Object.keys(await GetAllHtmlTemplates());
    expect(registered).to.include.members(BUILT_IN_EMAILS);
  });
});

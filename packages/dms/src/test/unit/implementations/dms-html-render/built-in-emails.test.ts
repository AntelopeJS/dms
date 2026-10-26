import { expect } from "chai";
import { GetAllHtmlTemplates } from "@antelopejs/interface-dms/html-render";

// Modules replace a built-in email by shipping a component of the same file
// name, and the docs list these names: renaming one is a breaking change.
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

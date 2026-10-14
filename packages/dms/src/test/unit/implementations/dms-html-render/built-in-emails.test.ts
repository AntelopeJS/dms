import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { GetAllHtmlTemplates } from "@antelopejs/interface-dms/html-render";

const PACKAGE_ROOT = path.resolve(__dirname, "../../../../..");
const EMAILS_DIR = path.join(
  PACKAGE_ROOT,
  "frontend-vue/layers/dms-layout/app/emails",
);

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

  it("ships a component named after each built-in email", () => {
    const components = fs
      .readdirSync(EMAILS_DIR)
      .filter((file) => file.endsWith(".vue"))
      .map((file) => path.basename(file, ".vue"));
    expect(components).to.have.members(BUILT_IN_EMAILS);
  });
});

import { expect } from "chai";
import { windowsCommandLine } from "../../../utils/package-manager/index";

describe("[unit] utils/package-manager — the Windows command line", () => {
  it("keeps the cmd.exe operators of a package spec inside quotes", () => {
    expect(
      windowsCommandLine("npm", [
        "view",
        "@acme/jobs@>=1 <2 || ^3.0.0 & calc",
        "--json",
      ]),
    ).to.equal('npm "view" "@acme/jobs@>=1 <2 || ^3.0.0 & calc" "--json"');
  });

  it("doubles trailing backslashes so the closing quote still ends the argument", () => {
    expect(
      windowsCommandLine("npm", [
        "pack",
        "--pack-destination",
        "C:\\Temp\\pack\\",
        "--silent",
      ]),
    ).to.equal(
      'npm "pack" "--pack-destination" "C:\\Temp\\pack\\\\" "--silent"',
    );
  });

  for (const argument of [
    'jobs" & calc & "',
    "%COMSPEC%",
    "!COMSPEC!",
    "jobs\n calc",
    "jobs\r calc",
  ]) {
    it(`refuses ${JSON.stringify(argument)}, which cmd.exe reads inside quotes`, () => {
      expect(() => windowsCommandLine("npm", ["view", argument])).to.throw(
        Error,
      );
    });
  }
});

import { expect } from "chai";
import {
  formatModuleList,
  isUpToDate,
} from "../../../dev/module-update-notifications";

describe("[unit] dev/module-update-notifications", () => {
  describe("isUpToDate", () => {
    it("treats an identical spec and latest as up to date", () => {
      expect(isUpToDate("1.2.3", "1.2.3")).to.equal(true);
    });

    it("treats a latest inside a caret range as up to date", () => {
      expect(isUpToDate("^1.2.0", "1.9.4")).to.equal(true);
    });

    it("flags a latest outside a caret range", () => {
      expect(isUpToDate("^1.2.0", "2.0.0")).to.equal(false);
    });

    it("flags a latest outside a tilde range", () => {
      expect(isUpToDate("~1.2.0", "1.3.0")).to.equal(false);
    });

    it("flags a newer latest against an exact spec", () => {
      expect(isUpToDate("1.2.3", "1.2.4")).to.equal(false);
    });

    it("ignores non-semver specs such as dist-tags", () => {
      expect(isUpToDate("beta", "2.0.0")).to.equal(true);
    });
  });

  describe("formatModuleList", () => {
    it("formats each module as package current → latest", () => {
      const formatted = formatModuleList([
        { package: "@antelopejs/database", current: "^1.2.0", latest: "2.0.0" },
        {
          package: "@antelopejs/dms-media",
          current: "0.4.1",
          latest: "1.0.0",
        },
      ]);
      expect(formatted).to.equal(
        "@antelopejs/database ^1.2.0 → 2.0.0, @antelopejs/dms-media 0.4.1 → 1.0.0",
      );
    });

    it("returns an empty string for an empty list", () => {
      expect(formatModuleList([])).to.equal("");
    });
  });
});

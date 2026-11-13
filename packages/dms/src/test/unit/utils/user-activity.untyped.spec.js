import { expect } from "chai";
import { isActivityWriteDue } from "../../../utils";

const NOW = new Date("2026-09-30T12:00:00.000Z");

describe("[unit] utils/user-activity", () => {
  describe("isActivityWriteDue", () => {
    it("reads a stored value serialized as a string", () => {
      const recent = new Date(NOW.getTime() - 1).toISOString();
      expect(isActivityWriteDue(recent, NOW)).to.equal(false);
    });
  });
});

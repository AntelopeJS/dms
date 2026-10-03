import { expect } from "chai";
import {
  EDITING_SESSION_MS,
  haveSameMembers,
  isWithinEditingSession,
  ownersToNotifyOfJoin,
  recipientsExcept,
} from "../../../utils/notification-rules";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const MINUTE_MS = 60 * 1000;
const STALE_SESSIONS = 3;

function msAgo(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("[unit] utils/notification-rules", () => {
  describe("isWithinEditingSession (coalescing of role edits)", () => {
    it("folds a save made soon after the previous one into its notification", () => {
      expect(isWithinEditingSession(msAgo(MINUTE_MS), NOW)).to.equal(true);
      expect(
        isWithinEditingSession(msAgo(EDITING_SESSION_MS - 1), NOW),
      ).to.equal(true);
    });

    it("starts a new notification once the session went quiet", () => {
      expect(isWithinEditingSession(msAgo(EDITING_SESSION_MS), NOW)).to.equal(
        false,
      );
      expect(
        isWithinEditingSession(msAgo(EDITING_SESSION_MS * STALE_SESSIONS), NOW),
      ).to.equal(false);
    });

    it("never folds into a session dated in the future or unreadable", () => {
      expect(isWithinEditingSession(msAgo(-MINUTE_MS), NOW)).to.equal(false);
      expect(isWithinEditingSession(new Date(Number.NaN), NOW)).to.equal(false);
    });
  });

  describe("ownersToNotifyOfJoin (inviter and owners)", () => {
    it("tells every owner when nobody is told as the inviter", () => {
      expect(ownersToNotifyOfJoin(["o1", "o2"], [], "new")).to.deep.equal([
        "o1",
        "o2",
      ]);
    });

    it("leaves out an inviter who is also an owner: they get the acceptance only", () => {
      expect(ownersToNotifyOfJoin(["o1", "o2"], ["o2"], "new")).to.deep.equal([
        "o1",
      ]);
    });

    it("never tells the newcomer about themself", () => {
      expect(ownersToNotifyOfJoin(["o1", "new"], [], "new")).to.deep.equal([
        "o1",
      ]);
    });
  });

  describe("recipientsExcept", () => {
    it("drops the excluded people, duplicates and empty exclusions", () => {
      expect(
        recipientsExcept(["a", "b", "a", "c"], ["b", undefined, null]),
      ).to.deep.equal(["a", "c"]);
    });
  });

  describe("haveSameMembers", () => {
    it("ignores order and duplicates", () => {
      expect(haveSameMembers(["r1", "r2"], ["r2", "r1", "r1"])).to.equal(true);
      expect(haveSameMembers([], [])).to.equal(true);
    });

    it("sees an added or removed id", () => {
      expect(haveSameMembers(["r1"], ["r1", "r2"])).to.equal(false);
      expect(haveSameMembers(["r1", "r2"], ["r1"])).to.equal(false);
    });
  });
});

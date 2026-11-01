import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  isActivityWriteDue,
  recordUserActivity,
  USER_ACTIVITY_WRITE_INTERVAL_MS,
} from "../../../utils";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const PASSWORD = "activity-test-password";

function msBefore(date: Date, ms: number): Date {
  return new Date(date.getTime() - ms);
}

describe("[unit] utils/user-activity", () => {
  describe("isActivityWriteDue", () => {
    it("is due for a user never seen", () => {
      expect(isActivityWriteDue(null, NOW)).to.equal(true);
      expect(isActivityWriteDue(undefined, NOW)).to.equal(true);
    });

    it("is not due within the write interval", () => {
      const recent = msBefore(NOW, USER_ACTIVITY_WRITE_INTERVAL_MS - 1);
      expect(isActivityWriteDue(recent, NOW)).to.equal(false);
    });

    it("is due once the write interval has elapsed", () => {
      const old = msBefore(NOW, USER_ACTIVITY_WRITE_INTERVAL_MS);
      expect(isActivityWriteDue(old, NOW)).to.equal(true);
    });

    it("reads a stored value serialized as a string", () => {
      // SAFETY: This intentionally supplies an ISO string to the Date-typed legacy-row boundary to verify runtime coercion; it is not a Date instance.
      const recent = msBefore(NOW, 1).toISOString() as unknown as Date;
      expect(isActivityWriteDue(recent, NOW)).to.equal(false);
    });
  });

  describe("recordUserActivity", () => {
    let user: User;

    beforeEach(async () => {
      const model = GetModel(UserModel);
      const [id] = await model.insert({
        email: `${randomUUID()}@activity.test`,
        name: "Activity test",
        authKey: randomUUID(),
        isValidated: true,
        owner: false,
        language: "en",
        password: PASSWORD,
        lastActiveAt: null,
      });
      const created = await model.get(id);
      if (!created) throw new Error("Failed to create activity-test user");
      user = created;
    });

    afterEach(async () => {
      if (user) await GetModel(UserModel).delete(user._id);
    });

    it("stores the first activity of a user", async () => {
      const model = GetModel(UserModel);
      await recordUserActivity(model, user, NOW);
      const stored = await model.get(user._id);
      expect(new Date(stored?.lastActiveAt ?? 0).getTime()).to.equal(
        NOW.getTime(),
      );
    });

    it("keeps the password verifiable", async () => {
      const model = GetModel(UserModel);
      await recordUserActivity(model, user, NOW);
      const stored = await model.get(user._id);
      expect(stored?.testHash("password", PASSWORD)).to.equal(true);
    });

    it("skips the write while the last one is recent", async () => {
      const model = GetModel(UserModel);
      await recordUserActivity(model, user, NOW);
      const soon = new Date(
        NOW.getTime() + USER_ACTIVITY_WRITE_INTERVAL_MS / 2,
      );
      await recordUserActivity(model, user, soon);
      const stored = await model.get(user._id);
      expect(new Date(stored?.lastActiveAt ?? 0).getTime()).to.equal(
        NOW.getTime(),
      );
    });
  });
});

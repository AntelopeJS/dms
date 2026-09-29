import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { SessionModel } from "@antelopejs/interface-dms/auth/db";
import { getAuthConfig } from "../../../config";
import { runSweepExpiredSessions } from "../../../crons/sweep-expired-sessions";

const USER_ID = "session-sweep-user";
const STALE_SESSION_ID = "session-sweep-stale";
const ACTIVE_SESSION_ID = "session-sweep-active";
const ONE_MINUTE_MS = 60_000;

describe("[unit] session sweep — idle sessions past the refresh token lifetime", () => {
  const model = GetModel(SessionModel);
  const now = new Date();
  const lifetime = getAuthConfig().refreshTokenLifetime;

  function insertSession(id: string, lastActiveAt: Date) {
    return model.insert({
      _id: id,
      userId: USER_ID,
      refreshToken: "",
      userAgent: "",
      ip: "",
      browser: "",
      os: "",
      deviceType: "",
      location: "",
      createdAt: lastActiveAt,
      lastActiveAt,
    });
  }

  before(async () => {
    await insertSession(
      STALE_SESSION_ID,
      new Date(now.getTime() - lifetime - ONE_MINUTE_MS),
    );
    await insertSession(
      ACTIVE_SESSION_ID,
      new Date(now.getTime() - lifetime + ONE_MINUTE_MS),
    );
  });

  after(async () => {
    await model.deleteByUserId(USER_ID);
  });

  it("deletes a session idle for longer than a refresh token lives, and keeps the others", async () => {
    await runSweepExpiredSessions(now);

    expect(await model.get(STALE_SESSION_ID)).to.equal(undefined);
    expect((await model.get(ACTIVE_SESSION_ID))?._id).to.equal(
      ACTIVE_SESSION_ID,
    );
  });
});

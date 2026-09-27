import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import {
  isCurrentRefreshToken,
  SessionModel,
} from "@antelopejs/interface-dms/auth/db";

const USER_ID = "session-refresh-token-user";
const LEGACY_SESSION_ID = "session-refresh-token-legacy";
const HASHED_SESSION_ID = "session-refresh-token-hashed";
const ONE_MINUTE_MS = 60_000;

describe("[unit] session refresh tokens — stored hashed, rotated against the database", () => {
  const model = GetModel(SessionModel);

  function insertSession(id: string, refreshToken: string) {
    const now = new Date();
    return model.insert({
      _id: id,
      userId: USER_ID,
      refreshToken,
      userAgent: "",
      ip: "",
      browser: "",
      os: "",
      deviceType: "",
      location: "",
      createdAt: now,
      lastActiveAt: now,
    });
  }

  after(async () => {
    await model.deleteByUserId(USER_ID);
  });

  it("rotates a legacy plaintext row once and leaves no plaintext behind", async () => {
    await insertSession(LEGACY_SESSION_ID, "legacy-T0");
    const rotatedAt = new Date();

    expect(
      await model.rotateRefreshToken(
        LEGACY_SESSION_ID,
        "legacy-T0",
        "legacy-T1",
        rotatedAt,
      ),
    ).to.equal("legacy-T1");

    const session = await model.get(LEGACY_SESSION_ID);
    expect(session?.refreshToken).to.equal("");
    expect(isCurrentRefreshToken(session!, "legacy-T1")).to.equal(true);
    expect(isCurrentRefreshToken(session!, "legacy-T0")).to.equal(false);
  });

  it("rotates a hashed row and hands the successor to a late predecessor holder", async () => {
    await insertSession(HASHED_SESSION_ID, "");
    await model.replaceRefreshToken(HASHED_SESSION_ID, "T1");
    const rotatedAt = new Date();

    expect(
      await model.rotateRefreshToken(HASHED_SESSION_ID, "T1", "T2", rotatedAt),
    ).to.equal("T2");
    expect(
      await model.rotateRefreshToken(
        HASHED_SESSION_ID,
        "T1",
        "loser",
        rotatedAt,
      ),
    ).to.equal("T2");
    expect(
      await model.rotateRefreshToken(
        HASHED_SESSION_ID,
        "T1",
        "late",
        new Date(rotatedAt.getTime() + ONE_MINUTE_MS),
      ),
    ).to.equal(null);

    const session = await model.get(HASHED_SESSION_ID);
    expect(session?.refreshToken).to.equal("");
    expect(isCurrentRefreshToken(session!, "T2")).to.equal(true);
  });
});

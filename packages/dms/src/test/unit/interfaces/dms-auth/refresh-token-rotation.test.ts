import { createHash, randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import {
  isCurrentRefreshToken,
  SessionModel,
} from "@antelopejs/interface-dms/auth/db/models/sessions.model";
import { REFRESH_TOKEN_PREDECESSOR_GRACE_MS } from "@antelopejs/interface-dms/auth/db/internal/sessions.model";
import type { Session } from "@antelopejs/interface-dms/auth/db/tables/sessions.table";

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

let model: SessionModel;
const storedSessionIds: string[] = [];

/** Stores a session whose current refresh token is `refreshToken`. */
async function storeSession(refreshToken: string): Promise<string> {
  const now = new Date();
  const [id] = await model.insert({
    userId: `rotation-${randomUUID()}`,
    refreshTokenHash: sha256(refreshToken),
    userAgent: "",
    ip: "",
    browser: "Unknown",
    os: "Unknown",
    deviceType: "desktop",
    location: "",
    createdAt: now,
    lastActiveAt: now,
  });
  storedSessionIds.push(id);
  return id;
}

async function storedSession(id: string): Promise<Session> {
  const session = await model.get(id);
  if (!session) throw new Error(`Session ${id} is not stored`);
  return session;
}

describe("refresh token rotation", () => {
  const committedAt = new Date("2026-08-28T12:00:00.000Z");

  before(() => {
    model = GetModel(SessionModel);
  });

  afterEach(async () => {
    for (const id of storedSessionIds.splice(0)) await model.delete(id);
  });

  it("returns the canonical winner to a concurrent CAS loser", async () => {
    const id = await storeSession("T0");

    expect(
      await model.rotateRefreshToken(id, "T0", "T1", committedAt),
    ).to.equal("T1");
    expect(
      await model.rotateRefreshToken(id, "T0", "loser", committedAt),
    ).to.equal("T1");
  });

  it("accepts a loser that began just before the winning commit", async () => {
    const id = await storeSession("T0");
    const loserStartedAt = new Date(committedAt.getTime() - 1);
    await model.rotateRefreshToken(id, "T0", "T1", committedAt);

    expect(
      await model.rotateRefreshToken(id, "T0", "loser", loserStartedAt),
    ).to.equal("T1");
  });

  it("recovers a late duplicate and response-loss retry", async () => {
    const id = await storeSession("T0");
    await model.rotateRefreshToken(id, "T0", "T1", committedAt);
    const retryAt = new Date(committedAt.getTime() + 10_000);

    expect(
      await model.rotateRefreshToken(id, "T0", "discarded", retryAt),
    ).to.equal("T1");
    expect((await storedSession(id)).refreshTokenRotatedAt).to.deep.equal(
      committedAt,
    );
  });

  it("does not slide predecessor expiry", async () => {
    const id = await storeSession("T0");
    await model.rotateRefreshToken(id, "T0", "T1", committedAt);
    await model.rotateRefreshToken(
      id,
      "T0",
      "discarded",
      new Date(committedAt.getTime() + 10_000),
    );
    const expiredAt = new Date(
      committedAt.getTime() + REFRESH_TOKEN_PREDECESSOR_GRACE_MS + 1,
    );

    expect(
      await model.rotateRefreshToken(id, "T0", "discarded", expiredAt),
    ).to.equal(null);
  });

  it("rejects other tokens and deleted sessions", async () => {
    const id = await storeSession("T0");
    await model.rotateRefreshToken(id, "T0", "T1", committedAt);
    expect(
      await model.rotateRefreshToken(id, "other", "discarded", committedAt),
    ).to.equal(null);

    await model.delete(id);
    expect(
      await model.rotateRefreshToken(id, "T0", "discarded", committedAt),
    ).to.equal(null);
  });

  it("clears predecessor state on replacement", async () => {
    const id = await storeSession("T0");
    await model.rotateRefreshToken(id, "T0", "T1", committedAt);

    await model.replaceRefreshToken(id, "replacement");

    expect(
      await model.rotateRefreshToken(id, "T0", "discarded", committedAt),
    ).to.equal(null);
  });

  it("keeps no refresh token in plaintext once rotated", async () => {
    const rotated = "rotated-refresh-token-in-plaintext";
    const id = await storeSession("T0");
    await model.rotateRefreshToken(id, "T0", rotated, committedAt);
    const session = await storedSession(id);

    expect(session.refreshTokenHash).to.equal(sha256(rotated));
    expect(session.sealedRefreshToken).to.be.a("string");
    expect(session.sealedRefreshToken).to.not.include(rotated);
    expect(isCurrentRefreshToken(session, rotated)).to.equal(true);
    expect(isCurrentRefreshToken(session, "T0")).to.equal(false);
  });

  it("hands the sealed successor back to a holder of the predecessor", async () => {
    const id = await storeSession("T0");
    await model.rotateRefreshToken(id, "T0", "T1", committedAt);
    const secondRotation = new Date(committedAt.getTime() + 60_000);
    await model.rotateRefreshToken(id, "T1", "T2", secondRotation);

    expect(
      await model.rotateRefreshToken(id, "T1", "loser", secondRotation),
    ).to.equal("T2");
  });

  it("opens nothing for a predecessor the successor was not sealed under", async () => {
    const id = await storeSession("T0");
    await model.rotateRefreshToken(id, "T0", "T1", committedAt);

    await model.update(id, { previousRefreshTokenHash: sha256("forged") });

    expect(
      await model.rotateRefreshToken(id, "forged", "loser", committedAt),
    ).to.equal(null);
  });

  it("stores only the hash on replacement", async () => {
    const id = await storeSession("T0");

    await model.replaceRefreshToken(id, "replacement");
    const session = await storedSession(id);

    expect(session.sealedRefreshToken).to.equal(null);
    expect(isCurrentRefreshToken(session, "replacement")).to.equal(true);
    expect(isCurrentRefreshToken(session, "T0")).to.equal(false);
  });
});

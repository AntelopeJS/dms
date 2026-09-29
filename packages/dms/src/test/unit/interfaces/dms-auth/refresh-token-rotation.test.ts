import { createHash } from "node:crypto";
import { expect } from "chai";
import {
  isCurrentRefreshToken,
  REFRESH_TOKEN_PREDECESSOR_GRACE_MS,
  SessionModel,
} from "@antelopejs/interface-dms/auth/db/models/sessions.model";
import type { Session } from "@antelopejs/interface-dms/auth/db/tables/sessions.table";

interface RotationUpdate {
  refreshToken: string;
  refreshTokenHash: string;
  sealedRefreshToken: string;
  previousRefreshTokenHash: string;
  refreshTokenRotatedAt: Date;
}

interface FakeModelState {
  currentSession?: Session;
}

type FakeModel = SessionModel & FakeModelState;

interface FakeTableHolder {
  table: FakeTable;
}

interface FakeTable {
  getAll: (sessionId: string) => FakeQuery;
}

interface FakeQuery {
  filter: (predicate: unknown) => FakeQuery;
  update: (update: RotationUpdate) => FakeQuery;
  run: () => Promise<number>;
}

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A session written before tokens were hashed: plaintext, no hash. */
function createLegacySession(refreshToken: string): Session {
  return { _id: "session", refreshToken } as Session;
}

/**
 * Mirrors the rotation filter: the row matches when the presented token, whose
 * hash the update records as the predecessor, is the current one — by hash,
 * or in plaintext for a legacy row.
 */
function matchesPresented(session: Session, presentedHash: string): boolean {
  if (session.refreshTokenHash) {
    return session.refreshTokenHash === presentedHash;
  }
  return (
    !!session.refreshToken && sha256(session.refreshToken) === presentedHash
  );
}

function createModel(): FakeModel {
  const model = Object.create(SessionModel.prototype) as FakeModel;
  let update: RotationUpdate;
  const tableHolder = model as unknown as FakeTableHolder;
  tableHolder.table = {
    getAll: () => {
      const query: FakeQuery = {
        filter: () => query,
        update: (nextUpdate) => {
          update = nextUpdate;
          return query;
        },
        run: async () => {
          const session = model.currentSession;
          if (
            !session ||
            !matchesPresented(session, update.previousRefreshTokenHash)
          )
            return 0;
          Object.assign(session, update);
          return 1;
        },
      };
      return query;
    },
  };
  model.get = async () => model.currentSession;
  return model;
}

describe("refresh token rotation", () => {
  const committedAt = new Date("2026-08-28T12:00:00.000Z");

  it("returns the canonical winner to a concurrent CAS loser", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");

    expect(
      await model.rotateRefreshToken("session", "T0", "T1", committedAt),
    ).to.equal("T1");
    expect(
      await model.rotateRefreshToken("session", "T0", "loser", committedAt),
    ).to.equal("T1");
  });

  it("accepts a loser that began just before the winning commit", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    const loserStartedAt = new Date(committedAt.getTime() - 1);
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);

    expect(
      await model.rotateRefreshToken("session", "T0", "loser", loserStartedAt),
    ).to.equal("T1");
  });

  it("recovers a late duplicate and response-loss retry", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);
    const retryAt = new Date(committedAt.getTime() + 10_000);

    expect(
      await model.rotateRefreshToken("session", "T0", "discarded", retryAt),
    ).to.equal("T1");
    expect(model.currentSession?.refreshTokenRotatedAt).to.deep.equal(
      committedAt,
    );
  });

  it("does not slide predecessor expiry", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);
    await model.rotateRefreshToken(
      "session",
      "T0",
      "discarded",
      new Date(committedAt.getTime() + 10_000),
    );
    const expiredAt = new Date(
      committedAt.getTime() + REFRESH_TOKEN_PREDECESSOR_GRACE_MS + 1,
    );

    expect(
      await model.rotateRefreshToken("session", "T0", "discarded", expiredAt),
    ).to.equal(null);
  });

  it("rejects other tokens and deleted sessions", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);
    expect(
      await model.rotateRefreshToken(
        "session",
        "other",
        "discarded",
        committedAt,
      ),
    ).to.equal(null);

    model.currentSession = undefined;
    expect(
      await model.rotateRefreshToken("session", "T0", "discarded", committedAt),
    ).to.equal(null);
  });

  it("clears predecessor state on replacement", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);
    Object.defineProperty(model, "update", {
      value: async (_id: string, update: Partial<Session>) => {
        if (!model.currentSession) return 0;
        Object.assign(model.currentSession, update);
        return 1;
      },
    });

    await model.replaceRefreshToken("session", "replacement");

    expect(
      await model.rotateRefreshToken("session", "T0", "discarded", committedAt),
    ).to.equal(null);
  });

  it("keeps no refresh token in plaintext once rotated", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);
    const session = model.currentSession as Session;

    expect(session.refreshToken).to.equal("");
    expect(session.refreshTokenHash).to.equal(sha256("T1"));
    expect(session.sealedRefreshToken).to.be.a("string");
    expect(session.sealedRefreshToken).to.not.include("T1");
    expect(isCurrentRefreshToken(session, "T1")).to.equal(true);
    expect(isCurrentRefreshToken(session, "T0")).to.equal(false);
  });

  it("accepts a legacy plaintext token once, then only its successor", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    expect(isCurrentRefreshToken(model.currentSession, "T0")).to.equal(true);
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);
    const afterGrace = new Date(
      committedAt.getTime() + REFRESH_TOKEN_PREDECESSOR_GRACE_MS + 1,
    );

    expect(
      await model.rotateRefreshToken("session", "T0", "discarded", afterGrace),
    ).to.equal(null);
    expect(
      await model.rotateRefreshToken("session", "T1", "T2", afterGrace),
    ).to.equal("T2");
  });

  it("hands the sealed successor back to a holder of the predecessor", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);
    const secondRotation = new Date(committedAt.getTime() + 60_000);
    await model.rotateRefreshToken("session", "T1", "T2", secondRotation);

    expect(
      await model.rotateRefreshToken("session", "T1", "loser", secondRotation),
    ).to.equal("T2");
  });

  it("opens nothing for a predecessor the successor was not sealed under", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);
    // Forge the predecessor check so only the seal stands in the way.
    (model.currentSession as Session).previousRefreshTokenHash =
      sha256("forged");

    expect(
      await model.rotateRefreshToken("session", "forged", "loser", committedAt),
    ).to.equal(null);
  });

  it("stores only the hash on replacement", async () => {
    const model = createModel();
    model.currentSession = createLegacySession("T0");
    Object.defineProperty(model, "update", {
      value: async (_id: string, update: Partial<Session>) => {
        Object.assign(model.currentSession as Session, update);
        return 1;
      },
    });

    await model.replaceRefreshToken("session", "replacement");
    const session = model.currentSession as Session;

    expect(session.refreshToken).to.equal("");
    expect(session.sealedRefreshToken).to.equal(null);
    expect(isCurrentRefreshToken(session, "replacement")).to.equal(true);
    expect(isCurrentRefreshToken(session, "T0")).to.equal(false);
  });
});

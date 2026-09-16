import { expect } from "chai";
import {
  REFRESH_TOKEN_PREDECESSOR_GRACE_MS,
  SessionModel,
} from "@antelopejs/interface-dms/auth/db/models/sessions.model";
import type { Session } from "@antelopejs/interface-dms/auth/db/tables/sessions.table";

interface RotationUpdate {
  refreshToken: string;
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

function createSession(refreshToken: string): Session {
  return { _id: "session", refreshToken } as Session;
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
          if (model.currentSession?.refreshToken !== "T0") return 0;
          Object.assign(model.currentSession, update);
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
    model.currentSession = createSession("T0");

    expect(
      await model.rotateRefreshToken("session", "T0", "T1", committedAt),
    ).to.equal("T1");
    expect(
      await model.rotateRefreshToken("session", "T0", "loser", committedAt),
    ).to.equal("T1");
  });

  it("accepts a loser that began just before the winning commit", async () => {
    const model = createModel();
    model.currentSession = createSession("T0");
    const loserStartedAt = new Date(committedAt.getTime() - 1);
    await model.rotateRefreshToken("session", "T0", "T1", committedAt);

    expect(
      await model.rotateRefreshToken("session", "T0", "loser", loserStartedAt),
    ).to.equal("T1");
  });

  it("recovers a late duplicate and response-loss retry", async () => {
    const model = createModel();
    model.currentSession = createSession("T0");
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
    model.currentSession = createSession("T0");
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
    model.currentSession = createSession("T0");
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
    model.currentSession = createSession("T0");
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
});

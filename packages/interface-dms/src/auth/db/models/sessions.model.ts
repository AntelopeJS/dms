import { createHash, timingSafeEqual } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { SESSIONS_TABLE_NAME, Session } from "../tables/sessions.table";

export const REFRESH_TOKEN_PREDECESSOR_GRACE_MS = 15_000;

interface UpdateResult {
  replaced?: number;
  modifiedCount?: number;
}

function updatedRows(result: unknown): number {
  if (typeof result === "number") return result;
  const counts = result as UpdateResult | undefined;
  return Number(counts?.replaced ?? counts?.modifiedCount ?? 0);
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isImmediateRefreshTokenPredecessor(
  session: Session,
  presentedToken: string,
  now: Date,
): boolean {
  if (!session.previousRefreshTokenHash || !session.refreshTokenRotatedAt) {
    return false;
  }
  const age = now.getTime() - session.refreshTokenRotatedAt.getTime();
  if (Math.abs(age) > REFRESH_TOKEN_PREDECESSOR_GRACE_MS) return false;
  return hashesMatch(
    session.previousRefreshTokenHash,
    hashRefreshToken(presentedToken),
  );
}

export class SessionModel extends BasicDataModel(Session, SESSIONS_TABLE_NAME) {
  /** Atomically rotates a token or resolves its immediate predecessor. */
  async rotateRefreshToken(
    sessionId: string,
    presentedToken: string,
    refreshToken: string,
    rotatedAt = new Date(),
  ): Promise<string | null> {
    const result: unknown = await this.table
      .getAll(sessionId)
      .filter((row) => row.key("refreshToken").eq(presentedToken))
      .update({
        refreshToken,
        previousRefreshTokenHash: hashRefreshToken(presentedToken),
        refreshTokenRotatedAt: rotatedAt,
        lastActiveAt: rotatedAt,
      })
      .run();
    if (updatedRows(result) > 0) return refreshToken;

    const session = await this.get(sessionId);
    if (
      !session ||
      !isImmediateRefreshTokenPredecessor(session, presentedToken, rotatedAt)
    ) {
      return null;
    }
    return session.refreshToken;
  }

  /** Replaces a refresh token without retaining predecessor eligibility. */
  async replaceRefreshToken(
    sessionId: string,
    refreshToken: string,
  ): Promise<void> {
    await this.update(sessionId, {
      refreshToken,
      previousRefreshTokenHash: null,
      refreshTokenRotatedAt: null,
    });
  }

  getByUserId(userId: string): Promise<Session[]> {
    return this.table
      .getAll(userId, "userId")
      .run()
      .then((res) =>
        res
          .map((s) => SessionModel.fromDatabase(s))
          .filter((s) => s !== undefined),
      );
  }

  deleteByUserId(userId: string): Promise<void> {
    return this.table
      .getAll(userId, "userId")
      .delete()
      .run()
      .then(() => undefined);
  }
}

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { SESSIONS_TABLE_NAME, Session } from "../tables/sessions.table";
import {
  isImmediateRefreshTokenPredecessor,
  hashRefreshToken,
  hashesMatch,
} from "../internal/sessions.model";

interface UpdateResult {
  replaced?: number;
  modifiedCount?: number;
}

function updatedRows(result: unknown): number {
  if (typeof result === "number") return result;
  const counts = result as UpdateResult | undefined;
  return Number(counts?.replaced ?? counts?.modifiedCount ?? 0);
}

const SEAL_ALGORITHM = "aes-256-gcm";
const SEAL_IV_BYTES = 12;
const SEAL_ENCODING = "base64";
const SEAL_SEPARATOR = ".";
const SEAL_KEY_DOMAIN = "dms-refresh-successor:";
const LAST_ACTIVE_AT_INDEX = "lastActiveAt";
const EPOCH_LOWER_BOUND = new Date(0);

// The grace window must hand the current token back to a client that still
// holds its predecessor, so the current token is sealed under a key derived
// from that predecessor. Only a holder of the predecessor can derive it: the
// stored `previousRefreshTokenHash` is a hash of the bare token, and the domain
// prefix keeps the two derivations apart, so the database alone opens nothing.
function sealKey(predecessor: string): Buffer {
  return createHash("sha256")
    .update(SEAL_KEY_DOMAIN + predecessor)
    .digest();
}

function sealRefreshToken(token: string, predecessor: string): string {
  const iv = randomBytes(SEAL_IV_BYTES);
  const cipher = createCipheriv(SEAL_ALGORITHM, sealKey(predecessor), iv);
  const sealed = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), sealed]
    .map((part) => part.toString(SEAL_ENCODING))
    .join(SEAL_SEPARATOR);
}

function openRefreshToken(sealed: string, predecessor: string): string | null {
  const [iv, authTag, ciphertext] = sealed
    .split(SEAL_SEPARATOR)
    .map((part) => Buffer.from(part, SEAL_ENCODING));
  if (!iv || !authTag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv(SEAL_ALGORITHM, sealKey(predecessor), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Whether a presented refresh token is the session's current one.
 *
 * @param session The session the token claims
 * @param presentedToken Token the client presented
 * @returns True when the token is the session's current refresh token
 */
export function isCurrentRefreshToken(
  session: Session,
  presentedToken: string,
): boolean {
  return (
    !!session.refreshTokenHash &&
    hashesMatch(session.refreshTokenHash, hashRefreshToken(presentedToken))
  );
}

function recoverSuccessor(
  session: Session,
  presentedToken: string,
): string | null {
  if (!session.sealedRefreshToken) return null;
  return openRefreshToken(session.sealedRefreshToken, presentedToken);
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
      .filter((row) =>
        row.key("refreshTokenHash").eq(hashRefreshToken(presentedToken)),
      )
      .update({
        refreshTokenHash: hashRefreshToken(refreshToken),
        sealedRefreshToken: sealRefreshToken(refreshToken, presentedToken),
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
    return recoverSuccessor(session, presentedToken);
  }

  /** Replaces a refresh token without retaining predecessor eligibility. */
  async replaceRefreshToken(
    sessionId: string,
    refreshToken: string,
  ): Promise<void> {
    await this.update(sessionId, {
      refreshTokenHash: hashRefreshToken(refreshToken),
      sealedRefreshToken: null,
      previousRefreshTokenHash: null,
      refreshTokenRotatedAt: null,
    });
  }

  /**
   * Deletes the sessions nobody has used since a date. A session's current
   * refresh token is issued no later than its last activity, so once that
   * activity is older than the refresh token lifetime, no token can revive it.
   *
   * @param threshold Sessions last active before this date are deleted
   */
  async deleteInactiveSince(threshold: Date): Promise<void> {
    await this.table
      .between(LAST_ACTIVE_AT_INDEX, EPOCH_LOWER_BOUND, threshold)
      .delete()
      .run();
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

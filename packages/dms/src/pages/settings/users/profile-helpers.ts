// The operations the profile controller chains together: avatar promotion and
// rollback, TOTP secret, backup codes and session formatting.
//
// The class stays in profile.ts: its @RegisterPage is what registers the page,
// and that only runs if the framework loads that file.
//
// Split out of profile.ts.

import crypto from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import type { AttachmentField } from "@antelopejs/interface-dms/attachments";
import {
  DeleteFile,
  isStagedKey,
  MoveFile,
  PromoteFile,
  stripStagingPrefix,
} from "@antelopejs/interface-file-storage";
import { type User } from "@antelopejs/interface-dms/auth/db";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { generateKey, verifyTOTP } from "2fa";
import { decode } from "jsonwebtoken";
import randomstring from "randomstring";
import { TWO_FACTOR_EMAIL_CODE_LIFETIME_MS } from "../../../routes/auth/constants";
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;
const TOTP_KEY_LENGTH = 20;
export const DMS_ISSUER = "AntelopeJS DMS";
export const AVATAR_DIMENSION_PX = 100;
export const AVATAR_MAX_UPLOAD_BYTES = 512 * 1024;
export const AVATAR_STORAGE_PATH = "avatars";
export const AVATAR_MIMETYPES = ["image/png", "image/jpeg", "image/webp"];
export const AVATAR_ATTACHMENT_FIELD = "profile-avatar#avatar";

export const avatarAttachmentFields: AttachmentField[] = [
  {
    id: AVATAR_ATTACHMENT_FIELD,
    key: "avatar",
    kind: "image",
    visibility: "private",
    constraints: {
      allowedMimetypes: AVATAR_MIMETYPES,
      maxSize: AVATAR_MAX_UPLOAD_BYTES,
    },
  },
];

export type AvatarValue = DefaultDataTypes.ImageValue | null;

export async function promoteAvatar(
  avatar: DefaultDataTypes.ImageValue,
): Promise<DefaultDataTypes.ImageValue> {
  if (!isStagedKey(avatar.key)) {
    return avatar;
  }
  const { resourceKey } = await PromoteFile(avatar.key);
  return { ...avatar, key: resourceKey };
}

export async function rollbackPromotedAvatar(stagedKey: string): Promise<void> {
  if (!isStagedKey(stagedKey)) {
    return;
  }
  await MoveFile(stripStagingPrefix(stagedKey), stagedKey).catch(
    () => undefined,
  );
}

export function deleteReplacedAvatar(
  previousKey: string | undefined,
  nextKey: string | undefined,
): void {
  if (!previousKey || previousKey === nextKey) {
    return;
  }
  void DeleteFile(previousKey).catch(() => undefined);
}

export interface UpdateProfileInput {
  name: string;
  email: string;
  password?: string | null;
  language?: string | null;
  avatar?: AvatarValue;
}

interface AvatarBodyProbe {
  avatar?: { key?: unknown };
}

export const HTTP_BAD_REQUEST = 400;

/**
 * The avatar may only reference a freshly staged upload (unguessable key,
 * bound to this field's destination by the presign token) or the key the user
 * already owns. Accepting any other existing resource key would let a user
 * adopt — and later delete, via the replaced-avatar cleanup — someone else's
 * file.
 */
export function assertAvatarKeyAllowed(
  key: string,
  currentKey: string | undefined,
): void {
  assert(
    key === currentKey || isStagedKey(key),
    HTTP_BAD_REQUEST,
    "error.invalid_avatar",
  );
}

/**
 * A client that saved once and submits again still holds the staged avatar key
 * while the file has already been promoted. Map that stale staged key back to
 * the stored key so the resubmission validates and stays a no-op.
 */
export function normalizeResubmittedAvatar(
  body: unknown,
  currentKey: string | undefined,
): unknown {
  if (!currentKey || !body || typeof body !== "object") {
    return body;
  }
  const { avatar } = body as AvatarBodyProbe;
  if (!avatar || typeof avatar !== "object") {
    return body;
  }
  if (typeof avatar.key !== "string" || !isStagedKey(avatar.key)) {
    return body;
  }
  if (stripStagingPrefix(avatar.key) !== currentKey) {
    return body;
  }
  return { ...body, avatar: { ...avatar, key: currentKey } };
}

export function generateTotpSecret(): Promise<string> {
  return new Promise((resolve, reject) => {
    generateKey(TOTP_KEY_LENGTH, (err, key) => {
      if (err) return reject(err);
      resolve(key);
    });
  });
}

interface BackupCodes {
  plaintext: string[];
  hashed: string[];
}

export function generateBackupCodes(): BackupCodes {
  const plaintext: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = randomstring.generate({
      length: BACKUP_CODE_LENGTH,
      capitalization: "uppercase",
      charset: "alphanumeric",
    });
    plaintext.push(code);
    hashed.push(crypto.createHash("sha256").update(code).digest("hex"));
  }
  return { plaintext, hashed };
}

type TwoFactorMethod = "totp" | "email";

const USER_CODE_VERIFIERS: Record<
  TwoFactorMethod,
  (user: User, code: string) => boolean
> = {
  totp: (user, code) =>
    !!(user.twoFactorSecret && verifyTOTP(user.twoFactorSecret, code)),
  email: (user, code) => {
    if (!user.twoFactorEmailCode) return false;
    const isExpired =
      !user.twoFactorEmailCodeRequestedAt ||
      Date.now() - new Date(user.twoFactorEmailCodeRequestedAt).getTime() >
        TWO_FACTOR_EMAIL_CODE_LIFETIME_MS;
    return !isExpired && user.twoFactorEmailCode === code;
  },
};

export function verifyUserCode(
  user: User,
  code: string,
  method: TwoFactorMethod,
): boolean {
  return USER_CODE_VERIFIERS[method](user, code);
}

export interface SessionResponse {
  _id: string;
  browser: string;
  os: string;
  ip: string;
  deviceType: string;
  location: string;
  createdAt: Date;
  lastActiveAt: Date;
  isCurrent: boolean;
}

export function extractSessionId(authorization: string): string | undefined {
  const token = authorization?.split(" ")[1];
  if (!token) return undefined;
  const payload = decode(token) as { sessionId?: string } | null;
  return payload?.sessionId;
}

interface SessionRecord {
  _id: string;
  browser: string;
  os: string;
  ip: string;
  deviceType: string;
  location: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export function formatSession(
  session: SessionRecord,
  currentSessionId: string | undefined,
): SessionResponse {
  return {
    _id: session._id,
    browser: session.browser,
    os: session.os,
    ip: session.ip,
    deviceType: session.deviceType || "desktop",
    location: session.location || "",
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    isCurrent: session._id === currentSessionId,
  };
}

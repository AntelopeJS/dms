import { fromDatabase } from "@antelopejs/interface-database-decorators";
import { User } from "@antelopejs/interface-dms/auth/db";
import { type StoredRow, storedFixture } from "./stored-row";

const BLANK_USER_TIME = "2026-01-01T00:00:00.000Z";

/**
 * Every column of a stored account that has done nothing since it was made:
 * validated, no password, no second factor, no pending token.
 */
function blankUserRow(id: string): StoredRow<User> {
  return {
    _id: id,
    createdAt: new Date(BLANK_USER_TIME),
    updatedAt: new Date(BLANK_USER_TIME),
    email: `${id}@users.test`,
    name: id,
    avatar: null,
    language: "en",
    password: null,
    passwordChangedAt: null,
    authKey: `${id}-auth-key`,
    isValidated: true,
    validationToken: null,
    validationRequestedAt: null,
    forgotPasswordToken: null,
    forgotPasswordRequestedAt: null,
    owner: false,
    lastActiveAt: null,
    twoFactorMethods: [],
    twoFactorSecret: null,
    twoFactorPendingSecret: null,
    twoFactorBackupCodes: [],
    twoFactorBackupCodesGeneratedAt: null,
    twoFactorBackupCodesSavedAt: null,
    twoFactorEmailCode: null,
    twoFactorEmailCodeRequestedAt: null,
  };
}

/**
 * A stored-user instance read from a full row: the given fields over the
 * columns of a blank account.
 */
export function storedUserFixture(
  fields: Pick<User, "_id"> & Partial<StoredRow<User>>,
): User {
  return storedFixture(User, { ...blankUserRow(fields._id), ...fields });
}

/**
 * A stored-user instance carrying only the given fields; every other column
 * stays unset, as on a row the database has not filled in.
 */
export function userFixture(fields: Pick<User, "_id"> & Partial<User>): User {
  return Object.assign(new User(), fields);
}

/**
 * A stored-user instance read from a row of the given fields, so `password`
 * holds exactly the given text. Assigning the field hashes it, which would
 * hide a leaked password from a text search and rewrite what a test reads
 * back.
 */
export function plainPasswordUserFixture(
  fields: Pick<User, "_id"> & Partial<User>,
): User {
  return fromDatabase(fields, User);
}

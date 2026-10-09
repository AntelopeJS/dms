// A sign-in email change in two steps: the request, proven by the current
// password, sends a code to the new address and a notice to the current one;
// the account moves only once the code comes back.
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  normalizeEmail,
  type User,
  type UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { MILLISECONDS_PER_HOUR } from "@antelopejs/interface-dms/utils/internal/time";
import { getAuthConfig } from "../../../config";
import {
  type PendingEmailChange,
  UserEmailChangesModel,
} from "../../../db/models/userEmailChanges.model";
import { notifyEmailChanged } from "../../../utils/account-notifications";
import {
  sendEmailChangeCode,
  sendEmailChangeNotice,
} from "../../../utils/email-change-mail";
import {
  generateCode,
  hashCode,
  hashesMatch,
} from "../../../utils/one-time-code";
import { securitySchema } from "../../../validation/security.schema";
import { assertCurrentPassword } from "./current-password";
import { assertEmailAvailable } from "./profile-helpers";

const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
/**
 * One request per window, per user and per new address: each one sends two
 * emails, and the code goes to an address nobody has proven yet.
 */
const REQUEST_INTERVAL_MS = 60 * 1000;
/** Codes tried against one before it is burnt and a new one must be asked. */
const MAX_CODE_ATTEMPTS = 5;
const TOO_MANY_ATTEMPTS = "error.email_change_too_many_attempts";

export interface EmailChangeRequested {
  /** The address waiting for its code. */
  pendingEmail: string;
}

export interface EmailChangeCancelled {
  success: true;
}

function codeLifetimeText(): string {
  const hours =
    getAuthConfig().emailValidationTokenLifetime / MILLISECONDS_PER_HOUR;
  return `${hours} hours`;
}

// The latest change is read whether it is still pending or not: cancelling
// one must not open the window again.
async function assertMayRequest(
  userId: string,
  email: string,
  now: number,
): Promise<void> {
  const changes = GetModel(UserEmailChangesModel);
  const since = new Date(now - REQUEST_INTERVAL_MS);
  const [latest, isAddressBusy] = await Promise.all([
    changes.findLatest(userId),
    changes.wasSentToSince(email, since),
  ]);
  const isTooSoon = !!latest && latest.requestedAt > since;
  assert(
    !isTooSoon && !isAddressBusy,
    HTTP_TOO_MANY_REQUESTS,
    "error.rate_limited",
  );
}

// The try is counted before the code is compared, so concurrent guesses
// cannot slip past the limit; the one that uses the last try up burns the
// code.
async function assertCodeMatches(
  pending: PendingEmailChange,
  code: string,
): Promise<void> {
  const changes = GetModel(UserEmailChangesModel);
  const attempts = await changes.countAttempt(pending.userId);
  const isMatch =
    attempts <= MAX_CODE_ATTEMPTS &&
    hashesMatch(pending.codeHash, hashCode(pending.userId, code));
  const isBurnt = !isMatch && attempts >= MAX_CODE_ATTEMPTS;
  if (isBurnt) await changes.close(pending.userId);
  assert(!isBurnt, HTTP_TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS);
  assert(isMatch, HTTP_BAD_REQUEST, "error.invalid_token");
}

/**
 * Starts a change of the sign-in email once the current password is proven:
 * a code goes to the new address, a notice to the current one, and the
 * account keeps its address until {@link confirmEmailChange}.
 *
 * @param user The signed-in user
 * @param body `{ email, currentPassword }`
 * @param userModel Model the account is read from
 */
export async function requestEmailChange(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<EmailChangeRequested> {
  const { email, currentPassword } = assertValidation(body, (value) =>
    securitySchema.changeEmail.parse(value),
  );
  const now = Date.now();
  // Before the password: a wait that only the right password reached would
  // tell a guess was right.
  await assertMayRequest(user._id, normalizeEmail(email), now);
  await assertCurrentPassword(userModel, user, currentPassword);
  const available = await assertEmailAvailable(userModel, email, user._id);
  assert(available !== user.email, HTTP_BAD_REQUEST, "error.email_unchanged");

  const code = generateCode();
  await GetModel(UserEmailChangesModel).replacePending({
    userId: user._id,
    email: available,
    codeHash: hashCode(user._id, code),
    requestedAt: new Date(now),
  });
  // Neither email holds the answer: a provider slow to accept them must not
  // fail a request whose change is already recorded. A lost code is asked
  // again a minute later.
  fireAndForget(
    sendEmailChangeCode(user, available, code, codeLifetimeText()),
    "email change code to the new address",
  );
  fireAndForget(
    sendEmailChangeNotice(user, available),
    "email change notice to the current address",
  );
  return { pendingEmail: available };
}

/**
 * Moves the account to the pending address once its code comes back, and
 * marks it validated: the code proves the user reads it. The address is
 * checked again: another account may have taken it meanwhile. After
 * {@link MAX_CODE_ATTEMPTS} tries the code is burnt and a new one must be
 * asked.
 *
 * @param user The signed-in user
 * @param body `{ code }`
 * @param userModel Model the account is written to
 * @returns The new address
 */
export async function confirmEmailChange(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<string> {
  const { code } = assertValidation(body, (value) =>
    securitySchema.confirmEmailChange.parse(value),
  );
  const changes = GetModel(UserEmailChangesModel);
  const pending = await changes.findPending(user._id);
  assert(pending, HTTP_BAD_REQUEST, "error.email_change_not_requested");
  const age = Date.now() - pending.requestedAt.getTime();
  assert(
    age < getAuthConfig().emailValidationTokenLifetime,
    HTTP_BAD_REQUEST,
    "error.token_expired",
  );
  await assertCodeMatches(pending, code);
  const available = await assertEmailAvailable(
    userModel,
    pending.email,
    user._id,
  );
  user.email = available;
  user.isValidated = true;
  user.validationToken = null;
  user.validationRequestedAt = null;
  await userModel.update(user);
  await changes.close(user._id);
  fireAndForget(
    notifyEmailChanged(user._id, available),
    "email change notification",
  );
  return available;
}

/** Drops the pending change; the account keeps its address. */
export async function cancelEmailChange(
  user: User,
): Promise<EmailChangeCancelled> {
  await GetModel(UserEmailChangesModel).close(user._id);
  return { success: true };
}

/** The address a change is waiting on, or `null` when none is. */
export async function findPendingEmail(userId: string): Promise<string | null> {
  const pending = await GetModel(UserEmailChangesModel).findPending(userId);
  return pending?.email ?? null;
}

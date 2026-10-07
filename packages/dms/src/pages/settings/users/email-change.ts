// A sign-in email change in two steps: the request, proven by the current
// password, sends a code to the new address and a notice to the current one;
// the account moves only once the code comes back.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { MILLISECONDS_PER_HOUR } from "@antelopejs/interface-dms/utils/internal/time";
import { getAuthConfig } from "../../../config";
import { UserEmailChangesModel } from "../../../db/models/userEmailChanges.model";
import { notifyEmailChanged } from "../../../utils/account-notifications";
import {
  sendEmailChangeCode,
  sendEmailChangeNotice,
} from "../../../utils/email-change-mail";
import { securitySchema } from "../../../validation/security.schema";
import { assertCurrentPassword } from "./current-password";
import { assertEmailAvailable } from "./profile-helpers";

const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const CODE_DIGITS = 6;
const CODE_RANGE = 10 ** CODE_DIGITS;
/** One request per window: each one sends two emails. */
const REQUEST_INTERVAL_MS = 60 * 1000;

export interface EmailChangeRequested {
  /** The address waiting for its code. */
  pendingEmail: string;
}

export interface EmailChangeCancelled {
  success: true;
}

function generateCode(): string {
  return randomInt(0, CODE_RANGE).toString().padStart(CODE_DIGITS, "0");
}

function hashCode(userId: string, code: string): string {
  return createHash("sha256")
    .update(JSON.stringify([userId, code]))
    .digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  const [a, b] = [Buffer.from(left), Buffer.from(right)];
  return a.length === b.length && timingSafeEqual(a, b);
}

function codeLifetimeText(): string {
  const hours =
    getAuthConfig().emailValidationTokenLifetime / MILLISECONDS_PER_HOUR;
  return `${hours} hours`;
}

async function assertMayRequest(userId: string, now: number): Promise<void> {
  const pending = await GetModel(UserEmailChangesModel).findPending(userId);
  const isTooSoon =
    !!pending && now - pending.requestedAt.getTime() < REQUEST_INTERVAL_MS;
  assert(!isTooSoon, HTTP_TOO_MANY_REQUESTS, "error.rate_limited");
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
  await assertCurrentPassword(userModel, user, currentPassword);
  const available = await assertEmailAvailable(userModel, email, user._id);
  assert(available !== user.email, HTTP_BAD_REQUEST, "error.email_unchanged");
  const now = Date.now();
  await assertMayRequest(user._id, now);

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
 * Moves the account to the pending address once its code comes back. The
 * address is checked again: another account may have taken it meanwhile.
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
  assert(
    hashesMatch(pending.codeHash, hashCode(user._id, code)),
    HTTP_BAD_REQUEST,
    "error.invalid_token",
  );
  const available = await assertEmailAvailable(
    userModel,
    pending.email,
    user._id,
  );
  user.email = available;
  user.isValidated = true;
  await userModel.update(user);
  await changes.purgeUser(user._id);
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
  await GetModel(UserEmailChangesModel).purgeUser(user._id);
  return { success: true };
}

/** The address a change is waiting on, or `null` when none is. */
export async function findPendingEmail(userId: string): Promise<string | null> {
  const pending = await GetModel(UserEmailChangesModel).findPending(userId);
  return pending?.email ?? null;
}

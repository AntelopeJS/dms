import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SessionModel, type User } from "@antelopejs/interface-dms/auth/db";
import { SignInAttemptsModel } from "../db/models/signInAttempts.model";
import { UserKnownDevicesModel } from "../db/models/userKnownDevices.model";
import { notifyFailedSignIns, notifyNewLogin } from "./account-notifications";
import {
  evaluateFailedSignIns,
  FAILED_SIGN_IN_WINDOW_MS,
} from "./failed-sign-ins";
import { classifySignIn, describeSignInDevice } from "./sign-in-devices";
import { parseUserAgent } from "./user-agent";

const MS_PER_MINUTE = 60 * 1000;
/** Attempts older than this are pruned; they no longer weigh in any window. */
const ATTEMPT_RETENTION_MS = 24 * 60 * MS_PER_MINUTE;

function logFailure(what: string, userId: string, error: unknown): void {
  Logging.Error(`[DMS] Could not ${what} for "${userId}": ${String(error)}`);
}

async function openSessionFingerprints(userId: string): Promise<string[]> {
  const sessions = await GetModel(SessionModel).getByUserId(userId);
  return sessions.map(
    (session) =>
      describeSignInDevice(parseUserAgent(session.userAgent)).fingerprint,
  );
}

/**
 * Remembers the device of a successful sign-in and, when the account never
 * signed in from it before, warns its owner. Awaited before the new session
 * is written, so that session never counts as proof the device was known;
 * never throws, so a sign-in cannot fail on it.
 *
 * @param user The account signing in
 * @param userAgent Requesting user agent
 * @param ip Requesting IP
 */
export async function recordSignIn(
  user: User,
  userAgent: string,
  ip: string,
): Promise<void> {
  try {
    const device = describeSignInDevice(parseUserAgent(userAgent));
    const [knownFingerprints, sessionFingerprints] = await Promise.all([
      GetModel(UserKnownDevicesModel).listFingerprints(user._id),
      openSessionFingerprints(user._id),
    ]);
    const kind = classifySignIn(device.fingerprint, {
      knownFingerprints,
      sessionFingerprints,
      hasBeenActive: Boolean(user.lastActiveAt),
    });
    await GetModel(UserKnownDevicesModel).remember(
      user._id,
      device.fingerprint,
      new Date(),
    );
    if (kind === "new") void notifyNewLogin(user._id, device, ip);
  } catch (error) {
    logFailure("record the sign-in device", user._id, error);
  }
}

/** Remembers the device an account was created from, so its next sign-in there is quiet. */
export async function rememberSignInDevice(
  userId: string,
  userAgent: string,
): Promise<void> {
  try {
    const device = describeSignInDevice(parseUserAgent(userAgent));
    await GetModel(UserKnownDevicesModel).remember(
      userId,
      device.fingerprint,
      new Date(),
    );
  } catch (error) {
    logFailure("remember the sign-up device", userId, error);
  }
}

async function alertOnBurst(user: User, now: Date): Promise<void> {
  const attempts = GetModel(SignInAttemptsModel);
  const records = await attempts.listSince(
    user._id,
    new Date(now.getTime() - FAILED_SIGN_IN_WINDOW_MS),
  );
  const { failures, alertKey } = evaluateFailedSignIns(records, now);
  if (alertKey === undefined) return;
  if (!(await attempts.claimAlert(user._id, alertKey, now))) return;
  await notifyFailedSignIns(user._id, {
    count: failures,
    windowMinutes: FAILED_SIGN_IN_WINDOW_MS / MS_PER_MINUTE,
    hasTwoFactor: (user.twoFactorMethods?.length ?? 0) > 0,
  });
}

/**
 * Counts a wrong password and warns the owner once a burst crosses the
 * threshold. Not awaited by the login route: answering a wrong password
 * later for a real account than for an unknown address would tell the two
 * apart.
 */
export async function recordFailedPassword(user: User): Promise<void> {
  try {
    const now = new Date();
    const attempts = GetModel(SignInAttemptsModel);
    await attempts.recordFailure(user._id, now);
    await attempts.pruneBefore(
      user._id,
      new Date(now.getTime() - ATTEMPT_RETENTION_MS),
    );
    await alertOnBurst(user, now);
  } catch (error) {
    logFailure("record the failed sign-in", user._id, error);
  }
}

/** Forgets the failed attempts once the right password is given. */
export async function clearFailedPasswords(userId: string): Promise<void> {
  try {
    await GetModel(SignInAttemptsModel).clearFailures(userId);
  } catch (error) {
    logFailure("clear the failed sign-ins", userId, error);
  }
}

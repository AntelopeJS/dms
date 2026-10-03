// When a burst of wrong passwords deserves an alert. Pure: the store
// (sign-in-monitor.ts) records the attempts and sends the notification.

import type { SignInAttemptKind } from "../db/tables/signInAttempts.table";

export const FAILED_SIGN_IN_THRESHOLD = 5;
export const FAILED_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/** One stored attempt, as the decision reads it. */
export interface SignInAttemptRecord {
  _id: string;
  kind: SignInAttemptKind;
  createdAt: Date;
}

export interface FailedSignInDecision {
  /** Failed attempts within the window. */
  failures: number;
  /**
   * Identity of the burst to claim before alerting (its oldest attempt in the
   * window), or undefined when there is nothing to alert about: below the
   * threshold, or already alerted within the window.
   */
  alertKey?: string;
}

function isWithinWindow(record: SignInAttemptRecord, now: Date): boolean {
  return (
    now.getTime() - new Date(record.createdAt).getTime() <
    FAILED_SIGN_IN_WINDOW_MS
  );
}

/** One alert per window, not one per attempt past the threshold. */
export function evaluateFailedSignIns(
  records: readonly SignInAttemptRecord[],
  now: Date,
): FailedSignInDecision {
  const recent = records.filter((record) => isWithinWindow(record, now));
  const failures = recent
    .filter((record) => record.kind === "failed")
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  const isAlerted = recent.some((record) => record.kind === "alerted");
  if (failures.length < FAILED_SIGN_IN_THRESHOLD || isAlerted) {
    return { failures: failures.length };
  }
  return { failures: failures.length, alertKey: failures[0]._id };
}

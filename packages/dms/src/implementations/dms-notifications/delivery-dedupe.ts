// Keeps one copy of a notification sent several times in a row: a form
// submitted twice, a hook firing for each instance, a retried request. Pure:
// the delivery (index.ts) and the model store the row under the id given here.

import { createHash } from "node:crypto";
import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";

/** Identical notifications sent to one person this close together are one. */
export const DUPLICATE_WINDOW_MS = 10 * 1000;

const DUPLICATE_ID_PREFIX = "notification-recent:";

/** What makes two deliveries the same notification. */
export type DuplicateIdentity = Pick<
  NotificationData,
  "title" | "description" | "params" | "linkTo"
>;

/** The row ids a delivery is stored under, now and in the window before. */
export interface DuplicateIds {
  /** The id this delivery takes, unless another copy holds it already. */
  current: string;
  /**
   * The id a copy sent in the previous window took: a copy sent just before
   * the window turned is still a duplicate.
   */
  previous: string;
}

/** Params in key order, so two senders building them differently still match. */
function sortedParams(
  params: DuplicateIdentity["params"],
): [string, string | number][] {
  return Object.entries(params ?? {}).sort(([left], [right]) =>
    left < right ? -1 : Number(left > right),
  );
}

function duplicateId(
  userId: string,
  data: DuplicateIdentity,
  window: number,
): string {
  const identity = JSON.stringify([
    userId,
    data.title,
    data.description,
    sortedParams(data.params),
    data.linkTo || null,
    window,
  ]);
  return `${DUPLICATE_ID_PREFIX}${createHash("sha256").update(identity).digest("hex")}`;
}

/**
 * Deterministic ids for a delivery: the same recipient and content in the
 * same 10-second window give the same id, on every instance, so the database
 * refuses the second insert.
 */
export function duplicateIds(
  userId: string,
  data: DuplicateIdentity,
  now: Date,
): DuplicateIds {
  const window = Math.floor(now.getTime() / DUPLICATE_WINDOW_MS);
  return {
    current: duplicateId(userId, data, window),
    previous: duplicateId(userId, data, window - 1),
  };
}

/**
 * Whether a copy stored at `createdAt` still makes a delivery at `now` a
 * duplicate. Either way round: another instance's clock may run ahead.
 */
export function isWithinDuplicateWindow(createdAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - new Date(createdAt).getTime();
  return Math.abs(elapsed) < DUPLICATE_WINDOW_MS;
}

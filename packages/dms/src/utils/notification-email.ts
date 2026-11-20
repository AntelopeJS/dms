import type {
  NotificationEmailChannelInfo,
  NotificationSubjectInfo,
} from "@antelopejs/interface-dms/notifications/types";
import {
  findSubjectByPreferenceKey,
  isSubjectLocked,
} from "./notification-registry";
import { ownValue } from "./own-value";

interface EmailChannelSlot {
  /** The e-mail channel a module registered, if any. */
  channel?: NotificationEmailChannelInfo;
}

export const emailChannelSlot: EmailChannelSlot = {};

/** How a subject offers e-mail once its shorthand is read. */
export interface EmailOffer {
  /** E-mail is on for a user who never chose. */
  defaultOn: boolean;
}

/**
 * The subject's e-mail offer, or undefined when the subject does not offer
 * e-mail or no module registered the e-mail channel.
 */
export function emailOffer(
  subject: NotificationSubjectInfo,
): EmailOffer | undefined {
  if (!emailChannelSlot.channel || !subject.email) return undefined;
  return {
    defaultOn: subject.email !== true && subject.email.defaultOn === true,
  };
}

const EMAIL_KEY_SUFFIX = "@email";

/**
 * The key a user's e-mail choice for a subject is stored under, next to the
 * subject's in-app key in the same preference map.
 */
export function emailPreferenceKey(subject: NotificationSubjectInfo): string {
  return `${subject.category.id}:${subject.id}${EMAIL_KEY_SUFFIX}`;
}

/**
 * The subject a preference key switches, in the app or by e-mail, or
 * undefined when it names no registered subject or an e-mail switch the
 * subject does not offer.
 */
export function findPreferenceSubject(
  key: string,
): NotificationSubjectInfo | undefined {
  const inApp = findSubjectByPreferenceKey(key);
  if (inApp || !key.endsWith(EMAIL_KEY_SUFFIX)) return inApp;
  const subject = findSubjectByPreferenceKey(
    key.slice(0, -EMAIL_KEY_SUFFIX.length),
  );
  return subject && emailOffer(subject) ? subject : undefined;
}

/**
 * Whether a user with these stored preferences receives the subject by
 * e-mail. A locked subject that offers e-mail is mailed whatever they stored.
 */
export function isEmailOn(
  subject: NotificationSubjectInfo,
  preferences: Record<string, boolean>,
): boolean {
  const offer = emailOffer(subject);
  if (!offer) return false;
  if (isSubjectLocked(subject)) return true;
  return ownValue(preferences, emailPreferenceKey(subject)) ?? offer.defaultOn;
}

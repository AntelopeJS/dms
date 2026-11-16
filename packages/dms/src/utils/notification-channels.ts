import type {
  NotificationChannelId,
  NotificationChannelInfo,
  NotificationSubjectInfo,
} from "@antelopejs/interface-dms/notifications/types";
import {
  findSubjectByPreferenceKey,
  isSubjectLocked,
} from "./notification-registry";
import { ownValue } from "./own-value";

export const channelRegistry = new Map<
  NotificationChannelId,
  NotificationChannelInfo
>();

/** The ids of the channels a module has registered. */
export function getRegisteredChannelIds(): NotificationChannelId[] {
  return Array.from(channelRegistry.keys());
}

/** How a subject offers a channel once its shorthand is read. */
export interface ChannelOffer {
  /** The channel is on for a user who never chose. */
  defaultOn: boolean;
}

/** The subject's offer of `channel`, or undefined when it does not offer it. */
export function channelOffer(
  subject: NotificationSubjectInfo,
  channel: NotificationChannelId,
): ChannelOffer | undefined {
  const offer = subject.channels?.[channel];
  if (offer === undefined || offer === false) return undefined;
  return { defaultOn: offer !== true && offer.defaultOn === true };
}

/** The registered channels the subject offers, read. */
export function registeredChannelOffers(
  subject: NotificationSubjectInfo,
): Partial<Record<NotificationChannelId, ChannelOffer>> {
  const offers: Partial<Record<NotificationChannelId, ChannelOffer>> = {};
  for (const channel of getRegisteredChannelIds()) {
    const offer = channelOffer(subject, channel);
    if (offer) offers[channel] = offer;
  }
  return offers;
}

export function subjectPreferenceKey(subject: NotificationSubjectInfo): string {
  return `${subject.category.id}:${subject.id}`;
}

const CHANNEL_KEY_SEPARATOR = "@";

/**
 * The key a user's choice for `channel` on a subject is stored under, next
 * to the subject's in-app key in the same preference map.
 */
export function channelPreferenceKey(
  subject: NotificationSubjectInfo,
  channel: NotificationChannelId,
): string {
  return `${subjectPreferenceKey(subject)}${CHANNEL_KEY_SEPARATOR}${channel}`;
}

/** What a stored preference key switches. */
export interface PreferenceTarget {
  subject: NotificationSubjectInfo;
  /** Unset for the in-app switch. */
  channel?: NotificationChannelId;
}

/**
 * The subject and channel a preference key names, or undefined when it names
 * no registered subject, or a channel the subject does not offer or no module
 * has registered.
 */
export function findPreferenceTarget(
  key: string,
): PreferenceTarget | undefined {
  const inApp = findSubjectByPreferenceKey(key);
  if (inApp) return { subject: inApp };
  const separator = key.lastIndexOf(CHANNEL_KEY_SEPARATOR);
  if (separator < 0) return undefined;
  const subject = findSubjectByPreferenceKey(key.slice(0, separator));
  const channelId = key.slice(separator + 1);
  const channel = getRegisteredChannelIds().find((id) => id === channelId);
  if (!subject || !channel || !channelOffer(subject, channel)) return undefined;
  return { subject, channel };
}

/**
 * Whether a user with these stored preferences receives the subject through
 * `channel`. A locked subject reaches its recipients on every channel it
 * offers, whatever they stored.
 */
export function isChannelOn(
  subject: NotificationSubjectInfo,
  channel: NotificationChannelId,
  preferences: Record<string, boolean>,
): boolean {
  const offer = channelOffer(subject, channel);
  if (!offer) return false;
  if (isSubjectLocked(subject)) return true;
  return (
    ownValue(preferences, channelPreferenceKey(subject, channel)) ??
    offer.defaultOn
  );
}

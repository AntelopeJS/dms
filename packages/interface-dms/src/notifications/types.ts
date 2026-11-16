import type { Tone } from "../base/types/tone";

export type TogglePermission = "allowed" | "forbidden" | "default";

export type ReadScope = "individual" | "shared";

/** Colour of the icon well a notification is listed with. */
export type NotificationTone = Extract<
  Tone,
  "neutral" | "primary" | "success" | "warning" | "error"
>;

export interface NotificationCategoryInfo {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  icon: string;
  togglePermission?: TogglePermission;
  /** Translation key of a short module tag (`SaaS`) shown next to the category and on its notifications. */
  tagKey?: string;
}

export interface NotificationSubjectInfo {
  id: string;
  category: NotificationCategoryInfo;
  labelKey: string;
  descriptionKey?: string;
  togglePermission?: TogglePermission;
  /** Translation key of a badge shown next to the subject label (`Developer mode`). */
  badgeKey?: string;
  /**
   * The channels this subject also reaches its recipients through, next to
   * the in-app feed. A subject that names none is in-app only. A channel
   * delivers only when a module registers it (`NotificationChannel`).
   */
  channels?: NotificationChannelOffers;
}

/** The delivery channels a subject can offer next to the in-app feed. */
export type NotificationChannelId = "email";

/**
 * How a subject offers a channel. `true` offers it off until the user turns
 * it on; `{ defaultOn: true }` offers it on until the user turns it off.
 * `false` does not offer it.
 */
export type NotificationChannelOffer = boolean | { defaultOn?: boolean };

export type NotificationChannelOffers = Partial<
  Record<NotificationChannelId, NotificationChannelOffer>
>;

/** What a channel learns about one delivery besides its recipient and content. */
export interface NotificationDeliveryContext {
  /** Id of the in-app notification this delivery follows. */
  notificationId: string;
  /** The event key of a keyed send (`idempotencyKey`). */
  idempotencyKey?: string;
}

/**
 * A channel a notification also reaches its recipient through. The DMS calls
 * `deliver` once per stored in-app notification whose recipient has the
 * channel on for its subject.
 */
export interface NotificationChannelInfo {
  id: NotificationChannelId;
  /**
   * Hands one notification to the channel. A rejection is logged and never
   * fails the in-app delivery. Sends wait for it, so queue slow work.
   */
  deliver(
    userId: string,
    data: NotificationData,
    context: NotificationDeliveryContext,
  ): Promise<void> | void;
}

/** How a delivery is stored, whoever receives it. */
export interface DeliveryOptions {
  /**
   * By default, a notification identical to one the same recipient received
   * less than 10 seconds before is not stored again: a form submitted twice,
   * a hook firing on every instance, a retried request. Identical means the
   * same title, description, params, link, category, subject, tone and icon.
   * `false` stores every send. A keyed send (`idempotencyKey`) is stored once
   * per key either way.
   */
  dedupe?: boolean;
}

export interface SendOptions extends DeliveryOptions {
  readScope?: ReadScope;
  /**
   * The workspace the notification is about. Channels receive it in
   * `NotificationData.tenantId`; `toRoles` also limits its recipients to
   * this tenant's members.
   */
  tenantId?: string;
  /** Stable event key, unique across notification producers. Retries preserve delivery and dismissal state. */
  idempotencyKey?: string;
}

/** Options of `toRoles`: a send to the holders of roles. */
export interface RoleSendOptions extends SendOptions {
  /**
   * Only the members of this tenant holding the roles. Role ids belong to a
   * tenant, so a send about one tenant names it; without it, the holders are
   * looked up in every tenant.
   */
  tenantId?: string;
}

export interface NotificationData {
  icon: string;
  title: string;
  description: string;
  subject: NotificationSubjectInfo;
  linkTo?: string;
  params?: Record<string, string | number>;
  /** Icon well colour; unset notifications use `primary` while unread, neutral once read. */
  tone?: NotificationTone;
  /** The workspace the notification is about, from `SendOptions.tenantId`. */
  tenantId?: string;
}

export type RequiredFields = "icon" | "title" | "description" | "subject";

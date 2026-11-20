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
   * Whether the subject also reaches its recipients by e-mail, next to the
   * in-app feed. `true` offers it off until the user turns it on;
   * `{ defaultOn: true }` offers it on until the user turns it off. Unset or
   * `false`: in-app only. E-mail is delivered only once a module registers
   * the e-mail channel (`NotificationEmailChannel`).
   */
  email?: boolean | { defaultOn?: boolean };
}

/**
 * The e-mail channel a mail module registers. The DMS calls `deliver` once
 * per stored in-app notification whose recipient has e-mail on for its
 * subject.
 */
export interface NotificationEmailChannelInfo {
  /**
   * Hands one notification to the channel, with the id of the in-app
   * notification it follows. A rejection is logged and never fails the
   * in-app delivery. Sends wait for it, so queue slow work.
   */
  deliver(
    userId: string,
    data: NotificationData,
    notificationId: string,
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
   * The workspace the notification is about. The e-mail channel receives it
   * in `NotificationData.tenantId`. `toRoles` also limits its recipients to
   * this tenant's members holding the roles; without it, the holders are
   * looked up in every tenant.
   */
  tenantId?: string;
  /** Stable event key, unique across notification producers. Retries preserve delivery and dismissal state. */
  idempotencyKey?: string;
}

/** Options of `toRoles`: a send to the holders of roles. */
export interface RoleSendOptions extends SendOptions {}

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

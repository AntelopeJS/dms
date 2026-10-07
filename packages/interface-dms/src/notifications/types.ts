import type { Tone } from "../base/types/tone";

export type TogglePermission = "allowed" | "forbidden" | "default";

export type ReadScope = "individual" | "shared";

/**
 * Colour of the icon well a notification is listed with. The former `accent`
 * is still read as `primary` in 0.4, with a warning.
 */
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
  /** Stable event key, unique across notification producers. Retries preserve delivery and dismissal state. */
  idempotencyKey?: string;
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
}

export type RequiredFields = "icon" | "title" | "description" | "subject";

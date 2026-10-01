export type TogglePermission = "allowed" | "forbidden" | "default";

export type ReadScope = "individual" | "shared";

/** Colour of the icon well a notification is listed with. */
export type NotificationTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "error";

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

export interface SendOptions {
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
  /** Icon well colour; unset notifications use the accent while unread, neutral once read. */
  tone?: NotificationTone;
}

export type RequiredFields = "icon" | "title" | "description" | "subject";

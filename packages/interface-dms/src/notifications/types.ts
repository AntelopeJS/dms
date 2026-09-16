export type TogglePermission = "allowed" | "forbidden" | "default";

export type ReadScope = "individual" | "shared";

export interface NotificationCategoryInfo {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  icon: string;
  togglePermission?: TogglePermission;
}

export interface NotificationSubjectInfo {
  id: string;
  category: NotificationCategoryInfo;
  labelKey: string;
  descriptionKey?: string;
  togglePermission?: TogglePermission;
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
}

export type RequiredFields = "icon" | "title" | "description" | "subject";

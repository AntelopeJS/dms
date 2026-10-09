import { Logging } from "@antelopejs/interface-core/logging";
import { Notification } from "@antelopejs/interface-dms/notifications";
import type {
  NotificationSubjectInfo,
  NotificationTone,
} from "@antelopejs/interface-dms/notifications/types";

const MESSAGES_PREFIX = "$dms.notifications.messages";

/** Pages the DMS notifications send their reader to, where the action happens. */
export const NOTIFICATION_LINKS = {
  settings: "/settings",
  security: "/settings/user/security",
  members: "/settings/workspace/members",
  invites: "/settings/workspace/invites",
  roles: "/settings/workspace/roles",
} as const;

/** What every notification of one kind shares. */
export interface NotificationTemplate {
  icon: string;
  subject: NotificationSubjectInfo;
  /** Key under `dms.notifications.messages`. */
  messageId: string;
  linkTo: string;
  tone: NotificationTone;
}

/** What one delivery of a template adds. */
export interface NotificationDelivery {
  params?: Record<string, string | number>;
  /** Key of the title under the message, `title` by default (`title_one`…). */
  titleKey?: string;
  /** Key of the description under the message, `description` by default. */
  descriptionKey?: string;
  /** Stable event key, so a replayed event is delivered once. */
  idempotencyKey?: string;
}

function messageKey(messageId: string, field: string): string {
  return `${MESSAGES_PREFIX}.${messageId}.${field}`;
}

/**
 * Sends one notification to one user. A failure is logged, never thrown: a
 * notification is a side effect, and the action it reports already happened.
 */
export async function emitNotification(
  userId: string,
  template: NotificationTemplate,
  delivery: NotificationDelivery = {},
): Promise<void> {
  const {
    params = {},
    titleKey = "title",
    descriptionKey = "description",
  } = delivery;
  try {
    const sendOptions =
      delivery.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: delivery.idempotencyKey };
    await Notification()
      .icon(template.icon)
      .title(messageKey(template.messageId, titleKey))
      .description(messageKey(template.messageId, descriptionKey))
      .linkTo(template.linkTo)
      .subject(template.subject)
      .tone(template.tone)
      .params(params)
      .build()
      .toUser(userId, sendOptions);
  } catch (error) {
    Logging.Error(
      `[DMS] Failed to send notification "${template.messageId}" to "${userId}": ${String(error)}`,
    );
  }
}

/** {@link emitNotification} to each user, one row each. */
export async function emitNotificationToEach(
  userIds: readonly string[],
  template: NotificationTemplate,
  delivery: NotificationDelivery = {},
): Promise<void> {
  await Promise.all(
    userIds.map((userId) => emitNotification(userId, template, delivery)),
  );
}

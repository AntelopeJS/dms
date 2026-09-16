import { Logging } from "@antelopejs/interface-core/logging";
import {
  AccountSubject,
  CollaborationSubject,
  Notification,
  SecuritySubject,
} from "@antelopejs/interface-dms/notifications";
import type { NotificationSubjectInfo } from "@antelopejs/interface-dms/notifications/types";
import { parseUserAgent } from "./user-agent";

const MESSAGES_PREFIX = "$dms.notifications.messages";
const PROFILE_LINK = "/settings/user/profile";
const ADMINS_LINK = "/settings/user/admins";

interface NotificationTemplate {
  icon: string;
  subject: NotificationSubjectInfo;
  messageId: string;
  linkTo: string;
}

const templates = {
  newLogin: {
    icon: "i-ph-sign-in",
    subject: SecuritySubject,
    messageId: "new_login",
    linkTo: PROFILE_LINK,
  },
  newLoginUnknownDevice: {
    icon: "i-ph-sign-in",
    subject: SecuritySubject,
    messageId: "new_login_unknown_device",
    linkTo: PROFILE_LINK,
  },
  passwordChanged: {
    icon: "i-ph-key",
    subject: SecuritySubject,
    messageId: "password_changed",
    linkTo: PROFILE_LINK,
  },
  loginMethodAdded: {
    icon: "i-ph-plugs-connected",
    subject: SecuritySubject,
    messageId: "login_method_added",
    linkTo: PROFILE_LINK,
  },
  passwordReset: {
    icon: "i-ph-key",
    subject: SecuritySubject,
    messageId: "password_reset",
    linkTo: PROFILE_LINK,
  },
  emailChanged: {
    icon: "i-ph-envelope-simple",
    subject: SecuritySubject,
    messageId: "email_changed",
    linkTo: PROFILE_LINK,
  },
  backupCodesRegenerated: {
    icon: "i-ph-arrows-clockwise",
    subject: SecuritySubject,
    messageId: "backup_codes_regenerated",
    linkTo: PROFILE_LINK,
  },
  welcome: {
    icon: "i-ph-hand-waving",
    subject: AccountSubject,
    messageId: "welcome",
    linkTo: PROFILE_LINK,
  },
  collaboratorJoined: {
    icon: "i-ph-user-plus",
    subject: CollaborationSubject,
    messageId: "collaborator_joined",
    linkTo: ADMINS_LINK,
  },
} satisfies Record<string, NotificationTemplate>;

const TWO_FACTOR_METHODS: readonly string[] = ["totp", "email"];
const DEFAULT_TWO_FACTOR_METHOD = "totp";
const TWO_FACTOR_ICONS = {
  enabled: "i-ph-shield-check",
  disabled: "i-ph-shield-warning",
} as const;

function twoFactorTemplate(
  state: keyof typeof TWO_FACTOR_ICONS,
  method: string,
): NotificationTemplate {
  const safeMethod = TWO_FACTOR_METHODS.includes(method)
    ? method
    : DEFAULT_TWO_FACTOR_METHOD;
  return {
    icon: TWO_FACTOR_ICONS[state],
    subject: SecuritySubject,
    messageId: `two_factor_${state}_${safeMethod}`,
    linkTo: PROFILE_LINK,
  };
}

async function emit(
  userId: string,
  template: NotificationTemplate,
  params: Record<string, string | number> = {},
): Promise<void> {
  try {
    await Notification()
      .icon(template.icon)
      .title(`${MESSAGES_PREFIX}.${template.messageId}.title`)
      .description(`${MESSAGES_PREFIX}.${template.messageId}.description`)
      .linkTo(template.linkTo)
      .subject(template.subject)
      .params(params)
      .build()
      .toUser(userId);
  } catch (error) {
    Logging.Error(
      `[DMS] Failed to send notification "${template.messageId}" to "${userId}": ${String(error)}`,
    );
  }
}

function formatDevice(userAgent: string): string | null {
  const parsed = parseUserAgent(userAgent);
  return (
    [parsed.browserName, parsed.osName].filter(Boolean).join(" on ") || null
  );
}

export function notifyNewLogin(
  userId: string,
  userAgent: string,
  ip: string,
): Promise<void> {
  const device = formatDevice(userAgent);
  const origin = ip ? ` (${ip})` : "";

  if (!device) {
    return emit(userId, templates.newLoginUnknownDevice, { origin });
  }

  return emit(userId, templates.newLogin, { device, origin });
}

export function notifyPasswordChanged(userId: string): Promise<void> {
  return emit(userId, templates.passwordChanged);
}

export function notifyPasswordReset(userId: string): Promise<void> {
  return emit(userId, templates.passwordReset);
}

export function notifyLoginMethodAdded(
  userId: string,
  providerName: string,
): Promise<void> {
  return emit(userId, templates.loginMethodAdded, { provider: providerName });
}

export function notifyEmailChanged(
  userId: string,
  newEmail: string,
): Promise<void> {
  return emit(userId, templates.emailChanged, { email: newEmail });
}

export function notifyTwoFactorEnabled(
  userId: string,
  method: string,
): Promise<void> {
  return emit(userId, twoFactorTemplate("enabled", method));
}

export function notifyTwoFactorDisabled(
  userId: string,
  method: string,
): Promise<void> {
  return emit(userId, twoFactorTemplate("disabled", method));
}

export function notifyBackupCodesRegenerated(userId: string): Promise<void> {
  return emit(userId, templates.backupCodesRegenerated);
}

export function notifyWelcome(userId: string, name: string): Promise<void> {
  return emit(userId, templates.welcome, { name });
}

export async function notifyCollaboratorJoined(
  ownerIds: string[],
  name: string,
  email: string,
): Promise<void> {
  await Promise.all(
    ownerIds.map((ownerId) =>
      emit(ownerId, templates.collaboratorJoined, { name, email }),
    ),
  );
}

import {
  AccountSubject,
  SecuritySubject,
} from "@antelopejs/interface-dms/notifications";
import {
  emitNotification,
  NOTIFICATION_LINKS,
  type NotificationDelivery,
  type NotificationTemplate,
} from "./notification-emitter";
import { backupCodeUsedTone, LOW_BACKUP_CODES } from "./notification-tones";
import type { SignInDevice } from "./sign-in-devices";

function securityTemplate(
  messageId: string,
  icon: string,
  tone: NotificationTemplate["tone"],
): NotificationTemplate {
  return {
    icon,
    subject: SecuritySubject,
    messageId,
    linkTo: NOTIFICATION_LINKS.security,
    tone,
  };
}

const templates = {
  newLogin: securityTemplate("new_login", "i-ph-sign-in", "warning"),
  newLoginUnknownDevice: securityTemplate(
    "new_login_unknown_device",
    "i-ph-sign-in",
    "warning",
  ),
  passwordChanged: securityTemplate("password_changed", "i-ph-key", "warning"),
  loginMethodAdded: securityTemplate(
    "login_method_added",
    "i-ph-plugs-connected",
    "warning",
  ),
  passwordReset: securityTemplate("password_reset", "i-ph-key", "warning"),
  emailChanged: securityTemplate(
    "email_changed",
    "i-ph-envelope-simple",
    "warning",
  ),
  backupCodesRegenerated: securityTemplate(
    "backup_codes_regenerated",
    "i-ph-arrows-clockwise",
    "neutral",
  ),
  backupCodeUsed: securityTemplate(
    "backup_code_used",
    "i-ph-lifebuoy",
    "warning",
  ),
  failedSignIns: securityTemplate(
    "failed_sign_ins",
    "i-ph-warning-octagon",
    "error",
  ),
  welcome: {
    icon: "i-ph-hand-waving",
    subject: AccountSubject,
    messageId: "welcome",
    linkTo: NOTIFICATION_LINKS.security,
    tone: "success",
  },
} satisfies Record<string, NotificationTemplate>;

const TWO_FACTOR_METHODS: readonly string[] = ["totp", "email"];
const DEFAULT_TWO_FACTOR_METHOD = "totp";
const TWO_FACTOR_STATES = {
  enabled: { icon: "i-ph-shield-check", tone: "success" },
  disabled: { icon: "i-ph-shield-warning", tone: "warning" },
} as const;

function twoFactorTemplate(
  state: keyof typeof TWO_FACTOR_STATES,
  method: string,
): NotificationTemplate {
  const safeMethod = TWO_FACTOR_METHODS.includes(method)
    ? method
    : DEFAULT_TWO_FACTOR_METHOD;
  const { icon, tone } = TWO_FACTOR_STATES[state];
  return securityTemplate(`two_factor_${state}_${safeMethod}`, icon, tone);
}

/** The title naming the device, as precisely as the user agent allows. */
function newLoginTitle(device: SignInDevice): NotificationDelivery {
  if (device.browser && device.os) {
    return {
      titleKey: "title_browser_os",
      params: { browser: device.browser, os: device.os },
    };
  }
  return { params: { device: device.browser || device.os } };
}

export function notifyNewLogin(
  userId: string,
  device: SignInDevice,
  ip: string,
): Promise<void> {
  const isRecognised = Boolean(device.browser || device.os);
  const delivery = isRecognised ? newLoginTitle(device) : {};
  const params = { ...delivery.params };
  if (ip) params.ip = ip;
  return emitNotification(
    userId,
    isRecognised ? templates.newLogin : templates.newLoginUnknownDevice,
    {
      ...delivery,
      params,
      descriptionKey: ip ? "description" : "description_no_ip",
    },
  );
}

export function notifyPasswordChanged(userId: string): Promise<void> {
  return emitNotification(userId, templates.passwordChanged);
}

/** @param email Address the recovery link was sent to */
export function notifyPasswordReset(
  userId: string,
  email: string,
): Promise<void> {
  return emitNotification(userId, templates.passwordReset, {
    params: { email },
  });
}

export function notifyLoginMethodAdded(
  userId: string,
  providerName: string,
): Promise<void> {
  return emitNotification(userId, templates.loginMethodAdded, {
    params: { provider: providerName },
  });
}

export function notifyEmailChanged(
  userId: string,
  newEmail: string,
): Promise<void> {
  return emitNotification(userId, templates.emailChanged, {
    params: { email: newEmail },
  });
}

export function notifyTwoFactorEnabled(
  userId: string,
  method: string,
): Promise<void> {
  return emitNotification(userId, twoFactorTemplate("enabled", method));
}

export function notifyTwoFactorDisabled(
  userId: string,
  method: string,
): Promise<void> {
  return emitNotification(userId, twoFactorTemplate("disabled", method));
}

const COUNT_DESCRIPTION_KEYS: Readonly<Record<number, string>> = {
  0: "description_none",
  1: "description_one",
};

/** @param previousCount Codes the user still held before the new set replaced them */
export function notifyBackupCodesRegenerated(
  userId: string,
  previousCount: number,
): Promise<void> {
  return emitNotification(userId, templates.backupCodesRegenerated, {
    params: { count: previousCount },
    descriptionKey: COUNT_DESCRIPTION_KEYS[previousCount] ?? "description",
  });
}

function backupCodeUsedWording(left: number): NotificationDelivery {
  if (left === 0) {
    return { titleKey: "title_none", descriptionKey: "description_none" };
  }
  return left <= LOW_BACKUP_CODES ? { descriptionKey: "description_low" } : {};
}

/** @param left Backup codes still unused after this sign-in */
export function notifyBackupCodeUsed(
  userId: string,
  left: number,
): Promise<void> {
  return emitNotification(
    userId,
    { ...templates.backupCodeUsed, tone: backupCodeUsedTone(left) },
    { ...backupCodeUsedWording(left), params: { left } },
  );
}

/** Details of a burst of wrong passwords. */
export interface FailedSignInsAlert {
  count: number;
  windowMinutes: number;
  /** Two-factor authentication still stands between the guesser and the account. */
  hasTwoFactor: boolean;
}

export function notifyFailedSignIns(
  userId: string,
  { count, windowMinutes, hasTwoFactor }: FailedSignInsAlert,
): Promise<void> {
  return emitNotification(userId, templates.failedSignIns, {
    params: { count, minutes: windowMinutes },
    descriptionKey: hasTwoFactor ? "description_two_factor" : "description",
  });
}

export function notifyWelcome(userId: string, name: string): Promise<void> {
  return emitNotification(
    userId,
    templates.welcome,
    name ? { params: { name } } : { titleKey: "title_anonymous" },
  );
}

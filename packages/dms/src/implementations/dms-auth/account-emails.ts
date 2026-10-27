import { Logging } from "@antelopejs/interface-core/logging";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  GenerateHtml,
  RegisterHtmlTemplate,
} from "@antelopejs/interface-dms/html-render";
import { MILLISECONDS_PER_HOUR } from "@antelopejs/interface-dms/utils/internal/time";
import { Send } from "@antelopejs/interface-email";
import { getAuthConfig } from "../../config";
import {
  type BuiltInEmailSubject,
  builtInEmailSubject,
} from "../../utils/email-subjects";

interface ResetPasswordData {
  userName: string;
  resetCode: string;
  expiresIn: string;
  expiresInHours: number;
}

interface EmailValidationData {
  userName: string;
  validationCode: string;
  expiresIn: string;
  expiresInHours: number;
}

const ResetPasswordTemplate =
  RegisterHtmlTemplate<ResetPasswordData>("EmailResetPassword");

const EmailValidationTemplate = RegisterHtmlTemplate<EmailValidationData>(
  "EmailUserValidation",
);

interface TwoFactorEmailData {
  userName: string;
  verificationCode: string;
}

const TwoFactorEmailTemplate =
  RegisterHtmlTemplate<TwoFactorEmailData>("EmailTwoFactor");

interface AccountEmail {
  subject: BuiltInEmailSubject;
  /** How the logs name the email. */
  label: string;
  html: string;
}

async function sendAccountEmail(
  user: User,
  { subject, label, html }: AccountEmail,
): Promise<void> {
  const result = await Send({
    to: user.email,
    subject: builtInEmailSubject(subject, user.language),
    html,
  });

  if (!result.success) {
    Logging.Error(
      `[DMS-AUTH] Failed to send ${label} email to "${user.email}": ${result.error?.message}`,
    );
    throw new Error(`Failed to send email: ${result.error?.message}`);
  }

  Logging.Info(`[DMS-AUTH] ${label} email sent to "${user.email}"`);
}

export async function send2FAEmail(user: User, code: string): Promise<void> {
  const html = await GenerateHtml(
    TwoFactorEmailTemplate,
    {
      userName: user.name || user.email,
      verificationCode: code,
    },
    user.language,
  );
  await sendAccountEmail(user, { subject: "twoFactor", label: "2FA", html });
}

export async function sendEmailValidationEmail(user: User): Promise<void> {
  const expiryHours =
    getAuthConfig().emailValidationTokenLifetime / MILLISECONDS_PER_HOUR;

  const html = await GenerateHtml(
    EmailValidationTemplate,
    {
      userName: user.name || user.email,
      validationCode: user.validationToken,
      expiresIn: `${expiryHours} hours`,
      expiresInHours: expiryHours,
    },
    user.language,
  );
  await sendAccountEmail(user, {
    subject: "userValidation",
    label: "validation",
    html,
  });
}

export async function sendEmailForgotEmail(user: User): Promise<void> {
  const expiryHours =
    getAuthConfig().passwordRecoverTokenLifetime / MILLISECONDS_PER_HOUR;

  const html = await GenerateHtml(
    ResetPasswordTemplate,
    {
      userName: user.name || user.email,
      resetCode: user.forgotPasswordToken,
      expiresIn: `${expiryHours} hours`,
      expiresInHours: expiryHours,
    },
    user.language,
  );
  await sendAccountEmail(user, {
    subject: "resetPassword",
    label: "reset password",
    html,
  });
}

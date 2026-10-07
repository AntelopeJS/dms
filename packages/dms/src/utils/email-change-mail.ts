import { Send } from "@antelopejs/interface-email";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  GenerateHtml,
  RegisterHtmlTemplate,
} from "@antelopejs/interface-dms/html-render";

interface EmailChangeCodeData {
  userName: string;
  newEmail: string;
  code: string;
  expiresIn: string;
}

interface EmailChangeNoticeData {
  userName: string;
  newEmail: string;
}

const CodeTemplate = RegisterHtmlTemplate<EmailChangeCodeData>(
  "EmailChangeVerification",
);
const NoticeTemplate =
  RegisterHtmlTemplate<EmailChangeNoticeData>("EmailChangeNotice");

const CODE_SUBJECT = "Confirm your new sign-in email";
const NOTICE_SUBJECT = "Your sign-in email is being changed";

async function sendOrThrow(to: string, subject: string, html: string) {
  const result = await Send({ to, subject, html });
  if (!result.success) {
    throw new Error(`Failed to send email: ${result.error?.message}`);
  }
}

/**
 * Sends the code proving the new address to that address.
 *
 * @param expiresIn How long the code stays valid, as the email words it
 */
export async function sendEmailChangeCode(
  user: User,
  newEmail: string,
  code: string,
  expiresIn: string,
): Promise<void> {
  const html = await GenerateHtml(
    CodeTemplate,
    { userName: user.name || user.email, newEmail, code, expiresIn },
    user.language,
  );
  await sendOrThrow(newEmail, CODE_SUBJECT, html);
}

/** Tells the current address that the account is moving to `newEmail`. */
export async function sendEmailChangeNotice(
  user: User,
  newEmail: string,
): Promise<void> {
  const html = await GenerateHtml(
    NoticeTemplate,
    { userName: user.name || user.email, newEmail },
    user.language,
  );
  await sendOrThrow(user.email, NOTICE_SUBJECT, html);
}

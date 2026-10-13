import { Send } from "@antelopejs/interface-email";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  GenerateHtml,
  RegisterHtmlTemplate,
} from "@antelopejs/interface-dms/html-render";
import { builtInEmailSubject } from "./email-subjects";

interface EmailChangeCodeData {
  userName: string;
  newEmail: string;
  code: string;
  expiresIn: string;
  expiresInHours: number;
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

async function sendOrThrow(to: string, subject: string, html: string) {
  const result = await Send({ to, subject, html });
  if (!result.success) {
    throw new Error(`Failed to send email: ${result.error?.message}`);
  }
}

/**
 * Sends the code proving the new address to that address.
 *
 * @param expiresInHours How long the code stays valid, in hours
 */
export async function sendEmailChangeCode(
  user: User,
  newEmail: string,
  code: string,
  expiresInHours: number,
): Promise<void> {
  const html = await GenerateHtml(
    CodeTemplate,
    {
      userName: user.name || user.email,
      newEmail,
      code,
      expiresIn: `${expiresInHours} hours`,
      expiresInHours,
    },
    user.language,
  );
  await sendOrThrow(
    newEmail,
    builtInEmailSubject("emailChangeVerification", user.language),
    html,
  );
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
  await sendOrThrow(
    user.email,
    builtInEmailSubject("emailChangeNotice", user.language),
    html,
  );
}

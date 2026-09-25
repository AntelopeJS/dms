const DEFAULT_LANGUAGE = "en";
const LANGUAGE_CODE_LENGTH = 2;

/** The names an invitation email can mention, each one optional. */
export interface AdminInviteEmailNames {
  workspaceName?: string;
  inviterName?: string;
  platformName?: string;
}

interface AdminInviteSubjectCopy {
  generic: string;
  join: (target: string) => string;
  joinFromInviter: (inviter: string, target: string) => string;
  workspaceOnPlatform: (workspace: string, platform: string) => string;
}

// The subject is set here rather than in the template, which only renders the
// body; its wording follows the template's `emails.admin_invite` keys.
const SUBJECT_COPY: Record<string, AdminInviteSubjectCopy> = {
  en: {
    generic: "You're Invited to Join",
    join: (target) => `You're invited to join ${target}`,
    joinFromInviter: (inviter, target) =>
      `${inviter} invited you to join ${target}`,
    workspaceOnPlatform: (workspace, platform) => `${workspace} on ${platform}`,
  },
  fr: {
    generic: "Vous êtes invité à nous rejoindre",
    join: (target) => `Vous êtes invité à rejoindre ${target}`,
    joinFromInviter: (inviter, target) =>
      `${inviter} vous invite à rejoindre ${target}`,
    workspaceOnPlatform: (workspace, platform) =>
      `${workspace} sur ${platform}`,
  },
};

/**
 * The supported language an invitation email is written in: the two-letter
 * code of `language` when there is copy for it, English otherwise.
 */
export function resolveAdminInviteLanguage(language?: string): string {
  const code = language?.slice(0, LANGUAGE_CODE_LENGTH).toLowerCase();
  return code && Object.hasOwn(SUBJECT_COPY, code) ? code : DEFAULT_LANGUAGE;
}

function joinTarget(
  copy: AdminInviteSubjectCopy,
  names: AdminInviteEmailNames,
): string | undefined {
  const { workspaceName, platformName } = names;
  if (workspaceName && platformName) {
    return copy.workspaceOnPlatform(workspaceName, platformName);
  }
  return workspaceName || platformName;
}

/**
 * The subject of an invitation email: what the invitee is joining and who
 * asked, as far as `names` tells, else the generic wording.
 */
export function buildAdminInviteSubject(
  names: AdminInviteEmailNames,
  language?: string,
): string {
  const copy = SUBJECT_COPY[resolveAdminInviteLanguage(language)];
  const target = joinTarget(copy, names);
  if (!target) {
    return copy.generic;
  }
  return names.inviterName
    ? copy.joinFromInviter(names.inviterName, target)
    : copy.join(target);
}

/** What the signup link of an invitation carries. */
export interface AdminInviteSignupTarget {
  email: string;
  token: string;
  inviteeName?: string;
  language?: string;
}

/**
 * The signup page an invitation opens. It carries the invitation's language so
 * the page, and the account it creates, start in that language.
 */
export function buildAdminInviteSignupLink(
  clientBaseUrl: string,
  { email, token, inviteeName, language }: AdminInviteSignupTarget,
): string {
  const query = new URLSearchParams({ token, email });
  if (inviteeName) query.set("name", inviteeName);
  if (language) query.set("lang", language);
  return `${clientBaseUrl}/auth/signup?${query.toString()}`;
}

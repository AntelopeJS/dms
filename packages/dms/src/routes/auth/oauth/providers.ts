import { assert } from "@antelopejs/interface-api-util";

const HTTP_BAD_GATEWAY = 502;
const PROVIDER_UNREACHABLE_MESSAGE = "error.oauth.provider_unreachable";
const EMAIL_UNAVAILABLE_MESSAGE = "error.oauth.email_unavailable";
const IDENTITY_MALFORMED_MESSAGE = "error.oauth.identity_malformed";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_USER_AGENT = "AntelopeJS-DMS";
const GITHUB_HEADERS: Record<string, string> = {
  "User-Agent": GITHUB_USER_AGENT,
  "X-GitHub-Api-Version": "2022-11-28",
};
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/**
 * Identity a provider reports for the account that just authorized us.
 */
export interface ProviderIdentity {
  providerAccountId: string;
  email: string;
  isEmailVerified: boolean;
  name: string;
}

export interface OAuthProvider {
  /**
   * Human-readable provider name, for the auth-screen buttons and
   * user-facing security notifications.
   */
  displayName: string;
  /**
   * Icon name the auth screens render on the provider button.
   */
  icon: string;
  authorizeUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  fetchIdentity: (accessToken: string) => Promise<ProviderIdentity>;
}

interface GithubUser {
  id?: number | string;
  login?: string;
  name?: string | null;
}

interface GithubEmail {
  email?: string;
  primary?: boolean;
  verified?: boolean;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * The whole identity model keys on the provider account id, so a malformed or
 * hostile 200 must never coin an identity — an empty or missing id would
 * collapse every such login onto one deterministic row.
 */
function requireAccountId(value: unknown): string {
  const isUsable =
    isNonEmptyString(value) ||
    (typeof value === "number" && Number.isFinite(value));
  assert(isUsable, HTTP_BAD_GATEWAY, IDENTITY_MALFORMED_MESSAGE);
  return String(value);
}

async function fetchProviderJson<T>(
  url: string,
  accessToken: string,
  headers: Record<string, string>,
  failureMessage: string,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...headers,
    },
  });

  assert(response.ok, HTTP_BAD_GATEWAY, failureMessage);
  return (await response.json()) as T;
}

async function fetchGithubIdentity(
  accessToken: string,
): Promise<ProviderIdentity> {
  const user = await fetchProviderJson<GithubUser>(
    `${GITHUB_API_URL}/user`,
    accessToken,
    GITHUB_HEADERS,
    PROVIDER_UNREACHABLE_MESSAGE,
  );
  const providerAccountId = requireAccountId(user.id);

  const emails = await fetchProviderJson<GithubEmail[]>(
    `${GITHUB_API_URL}/user/emails`,
    accessToken,
    GITHUB_HEADERS,
    EMAIL_UNAVAILABLE_MESSAGE,
  );
  assert(Array.isArray(emails), HTTP_BAD_GATEWAY, EMAIL_UNAVAILABLE_MESSAGE);

  const primary = emails.find((entry) => entry.primary === true) ?? emails[0];
  assert(
    primary && isNonEmptyString(primary.email),
    HTTP_BAD_GATEWAY,
    EMAIL_UNAVAILABLE_MESSAGE,
  );

  const name = [user.name, user.login].find(isNonEmptyString);
  return {
    providerAccountId,
    email: primary.email,
    isEmailVerified: primary.verified === true,
    name: name ?? primary.email,
  };
}

async function fetchGoogleIdentity(
  accessToken: string,
): Promise<ProviderIdentity> {
  const profile = await fetchProviderJson<GoogleUserInfo>(
    GOOGLE_USERINFO_URL,
    accessToken,
    {},
    PROVIDER_UNREACHABLE_MESSAGE,
  );
  const providerAccountId = requireAccountId(profile.sub);
  assert(
    isNonEmptyString(profile.email),
    HTTP_BAD_GATEWAY,
    EMAIL_UNAVAILABLE_MESSAGE,
  );

  return {
    providerAccountId,
    email: profile.email,
    isEmailVerified: profile.email_verified === true,
    name: isNonEmptyString(profile.name) ? profile.name : profile.email,
  };
}

/**
 * Login providers shipped with the DMS. A provider only becomes available once
 * the instance configuration supplies its credentials.
 */
export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  github: {
    displayName: "GitHub",
    icon: "i-ph-github-logo",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    defaultScopes: ["read:user", "user:email"],
    fetchIdentity: fetchGithubIdentity,
  },
  google: {
    displayName: "Google",
    icon: "i-ph-google-logo",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultScopes: ["openid", "email", "profile"],
    fetchIdentity: fetchGoogleIdentity,
  },
};

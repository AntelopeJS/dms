import { assert } from "@antelopejs/interface-api-util";
import {
  getAuthConfig,
  getClientBaseUrl,
  type OAuthProviderCredentials,
} from "../../../config";
import { OAUTH_PROVIDERS, type OAuthProvider } from "./providers";

const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;
const PROVIDER_DISABLED_MESSAGE = "error.oauth.provider_disabled";
const CALLBACK_BASE_URL_MISSING_MESSAGE =
  "error.oauth.callback_base_url_missing";

const DEFAULT_ALLOW_ACCOUNT_CREATION = false;
const DEFAULT_LINK_BY_VERIFIED_EMAIL = true;

/**
 * Path the provider redirects back to, served by the DMS frontend.
 */
export const OAUTH_CALLBACK_PATH = "/auth/oauth";
const TRAILING_SLASH_PATTERN = /\/+$/;

export interface OAuthPolicy {
  allowAccountCreation: boolean;
  linkByVerifiedEmail: boolean;
}

export interface EnabledOAuthProvider {
  id: string;
  provider: OAuthProvider;
  credentials: OAuthProviderCredentials;
}

function hasCredentials(credentials?: OAuthProviderCredentials): boolean {
  return Boolean(credentials?.clientId && credentials?.clientSecret);
}

export function resolveOAuthPolicy(): OAuthPolicy {
  const oauth = getAuthConfig().oauth;
  return {
    allowAccountCreation:
      oauth?.allowAccountCreation ?? DEFAULT_ALLOW_ACCOUNT_CREATION,
    linkByVerifiedEmail:
      oauth?.linkByVerifiedEmail ?? DEFAULT_LINK_BY_VERIFIED_EMAIL,
  };
}

export interface OAuthProviderDescriptor {
  id: string;
  label: string;
  icon: string;
}

/**
 * Providers the instance can offer on its auth screens, with everything the
 * screens need to render a button — the single source the frontend consumes,
 * so adding a provider stays a one-file change.
 *
 * @returns Enabled provider descriptors, in the order the DMS declares them
 */
export function listEnabledOAuthProviders(): OAuthProviderDescriptor[] {
  const configured = getAuthConfig().oauth?.providers ?? {};
  return Object.entries(OAUTH_PROVIDERS)
    .filter(([id]) => hasCredentials(configured[id]))
    .map(([id, provider]) => ({
      id,
      label: provider.displayName,
      icon: provider.icon,
    }));
}

export function getEnabledOAuthProvider(
  providerId: string,
): EnabledOAuthProvider {
  const provider = OAUTH_PROVIDERS[providerId];
  const credentials = getAuthConfig().oauth?.providers?.[providerId];

  assert(
    provider && hasCredentials(credentials),
    HTTP_NOT_FOUND,
    PROVIDER_DISABLED_MESSAGE,
  );

  return {
    id: providerId,
    provider,
    credentials: credentials as OAuthProviderCredentials,
  };
}

/**
 * Absolute callback URL handed to the provider. It must match the one
 * registered in the provider's application settings.
 *
 * @param providerId Provider the callback belongs to
 * @returns Absolute redirect URI
 */
export function buildOAuthRedirectUri(providerId: string): string {
  const base = getAuthConfig().oauth?.callbackBaseUrl ?? getClientBaseUrl();
  assert(base, HTTP_INTERNAL_ERROR, CALLBACK_BASE_URL_MISSING_MESSAGE);
  const origin = base.replace(TRAILING_SLASH_PATTERN, "");
  return `${origin}${OAUTH_CALLBACK_PATH}/${providerId}/callback`;
}

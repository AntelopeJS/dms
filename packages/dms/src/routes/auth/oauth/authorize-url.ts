import { buildOAuthRedirectUri, getEnabledOAuthProvider } from "./config";
import { signOAuthState } from "./state";

export interface OAuthAuthorizeUrl {
  authorizeUrl: string;
  /**
   * State the caller must store in the browser and hand back on callback.
   */
  state: string;
}

/**
 * Build the provider URL the browser is sent to, along with the state binding
 * the round-trip to that browser.
 *
 * @param providerId Provider the user picked
 * @returns Provider authorization URL and its state
 */
export function buildOAuthAuthorizeUrl(providerId: string): OAuthAuthorizeUrl {
  const enabled = getEnabledOAuthProvider(providerId);
  const state = signOAuthState(providerId);
  const scopes = enabled.credentials.scopes ?? enabled.provider.defaultScopes;

  const url = new URL(enabled.provider.authorizeUrl);
  url.searchParams.set("client_id", enabled.credentials.clientId);
  url.searchParams.set("redirect_uri", buildOAuthRedirectUri(providerId));
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  return { authorizeUrl: url.toString(), state };
}

import { HTTPResult } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import type { EnabledOAuthProvider } from "./config";
import { buildOAuthRedirectUri } from "./config";

const HTTP_BAD_GATEWAY = 502;
const TOKEN_EXCHANGE_FAILED_MESSAGE = "error.oauth.token_exchange_failed";

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * Trade the authorization code for an access token.
 *
 * Runs here rather than in the browser-facing layer: the client secret never
 * leaves the instance, which is what makes the resulting identity trustworthy.
 *
 * @param enabled Provider and its instance credentials
 * @param code Authorization code returned by the provider
 * @returns Provider access token
 */
export async function exchangeCodeForAccessToken(
  enabled: EnabledOAuthProvider,
  code: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: enabled.credentials.clientId,
    client_secret: enabled.credentials.clientSecret,
    redirect_uri: buildOAuthRedirectUri(enabled.id),
    code,
  });

  const response = await fetch(enabled.provider.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  assert(response.ok, HTTP_BAD_GATEWAY, TOKEN_EXCHANGE_FAILED_MESSAGE);
  const tokens = (await response.json()) as TokenResponse;

  if (tokens.access_token) {
    return tokens.access_token;
  }

  Logging.Error(
    `[DMS] OAuth token exchange rejected by "${enabled.id}": ${tokens.error ?? "unknown error"}`,
  );
  throw new HTTPResult(HTTP_BAD_GATEWAY, TOKEN_EXCHANGE_FAILED_MESSAGE);
}

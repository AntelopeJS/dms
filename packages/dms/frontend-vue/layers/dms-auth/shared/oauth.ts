export interface TwoFactorHandoff {
  kind: "2fa";
  token: string;
  methods: string[];
}

export interface NoWorkspaceHandoff {
  kind: "no-workspace";
  token: string;
  provider: string;
}

export interface NoHandoff {
  kind: "none";
}

/**
 * Short-lived credential hand-over between the OAuth callback and the
 * completion page. The tokens ride an httpOnly one-shot cookie instead of a
 * redirect's `Location:` header, so they never reach the access logs of
 * whatever sits in front of the app; the completion page then navigates
 * client-side, matching the exposure of the password login path.
 *
 * Shared between the server routes that write the handoff and the completion
 * page that consumes it, so the contract cannot drift silently.
 */
export type OAuthHandoff = TwoFactorHandoff | NoWorkspaceHandoff | NoHandoff;

export const OAUTH_HANDOFF_KINDS = [
  "2fa",
  "no-workspace",
  "none",
] as const satisfies readonly OAuthHandoff["kind"][];

const ABSOLUTE_PATH_PATTERN = /^\/(?!\/)[^\\]*$/;

/**
 * Keep only same-origin, non-protocol-relative paths: the redirect target
 * travels through the provider round-trip and query strings of public pages,
 * and must never turn the login flow into an open redirect. Shared so the
 * server routes and the completion page apply the exact same rule.
 */
export function sanitizeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || !ABSOLUTE_PATH_PATTERN.test(value)) {
    return "";
  }
  return value;
}

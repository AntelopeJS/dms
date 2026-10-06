import type { User } from "./db";

/** Identity and tenant established together by a verified credential, not authorization. */
export interface RequestPrincipal {
  user: User;
  tenantId: string;
}

/** A route-local credential handler. Recognition must include malformed owned credentials. */
export interface RequestAuthenticator {
  /** Claim this credential family without treating its contents as trusted. */
  recognizes(token: string): boolean;
  /** Verify the credential and reload its user; throw on invalid, expired or revoked credentials. */
  authenticate(token: string): Promise<RequestPrincipal>;
}

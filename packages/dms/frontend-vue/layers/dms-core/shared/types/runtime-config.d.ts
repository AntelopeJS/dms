interface DmsOAuthProviderDescriptor {
  id: string;
  label: string;
  icon: string;
}

interface DmsPublicConfig {
  baseURL: string;
  homepage?: string;
  mustValidateEmail?: boolean;
  clientBaseUrl?: string;
  /**
   * Login providers the instance enabled, with their display metadata.
   * Provider credentials stay on the API side and never reach the browser.
   */
  oauthProviders?: DmsOAuthProviderDescriptor[];
}

/**
 * Server-only runtime config, never mirrored into `PublicRuntimeConfig`.
 *
 * The backend serves these values on its manifest endpoint only to a caller
 * presenting the instance's bootstrap credential, so they reach the frontend
 * server and stop there. A frontend built against a backend that did not
 * recognize the credential receives none of them, and every feature below
 * fails at runtime when the DMS bootstrap secret is invalid.
 */
interface DmsPrivateConfig {
  /**
   * Always populated: the module falls back to its default render config and
   * always writes `serviceSecret` into the runtime config, so consumers may
   * read it without a guard.
   */
  htmlRender: {
    serviceSecret: string;
  };
  oauth?: {
    /**
     * Secret the server routes present to the DMS API's OAuth endpoints,
     * proving the call comes from an instance frontend server. Derived
     * backend-side from the instance `jwtSecret`; never exposed to browsers.
     */
    relaySecret: string;
    /**
     * Whether a trusted reverse proxy sits immediately in front and appends
     * to `x-forwarded-for`.
     *
     * @deprecated Mirrors the deprecated `auth.oauth.trustProxy`. The frontend
     * server keys its OAuth rate limit on its own `DMS_TRUSTED_PROXY_HOPS`.
     */
    trustProxy?: boolean;
  };
}

interface DmsBrowserSession {
  accountId: string;
  activeTenantId?: string;
}

declare module "#dms/frontend-module" {
  import type { User } from "../../app/types/user";

  interface PublicRuntimeConfig {
    dms: DmsPublicConfig;
  }

  interface RuntimeConfig {
    dms: DmsPrivateConfig;
  }

  interface DmsUser extends User {}

  interface DmsSession extends DmsBrowserSession {}
}

export {};

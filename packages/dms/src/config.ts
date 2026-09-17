import type { HtmlRenderConfig } from "@antelopejs/interface-dms/html-render";
import { defu } from "defu";
import type { RealtimeConfig } from "./realtime";
import {
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from "@antelopejs/interface-dms/utils/time";

/**
 * Runtime configuration state and accessors.
 *
 * Deliberately a leaf module: files reachable from the interface subpath
 * entries (`<pkg>/interfaces/...`) call these accessors, and importing the
 * package root from that path re-enters `index.ts` while it is still
 * evaluating, crashing consumers whose first entry is an interface subpath.
 * Nothing here may import `./index`, `./pages`, or anything that does.
 */

export interface OAuthProviderCredentials {
  clientId: string;
  clientSecret: string;
  /**
   * Overrides the provider's default scopes. Only widen them when the instance
   * genuinely needs more than an identity.
   */
  scopes?: string[];
}

export interface OAuthConfig {
  /**
   * Credentials per provider id. A provider without credentials stays
   * disabled and is never offered on the auth screens.
   */
  providers?: Partial<Record<string, OAuthProviderCredentials>>;
  /**
   * Allows an unknown provider identity to create a user. Off by default:
   * instances where registration is invite-only must opt in before OAuth
   * becomes a signup entry point.
   */
  allowAccountCreation?: boolean;
  /**
   * Binds a provider identity to the existing account carrying the same
   * e-mail, provided the provider marks it verified and the local account is
   * validated. Turn off to require linking from an already authenticated
   * session.
   */
  linkByVerifiedEmail?: boolean;
  /**
   * Public origin the provider redirects back to. Defaults to `clientBaseUrl`;
   * set it when the browser-facing origin differs from the configured one.
   */
  callbackBaseUrl?: string;
  /**
   * Declares that a trusted reverse proxy sits immediately in front of the
   * frontend servers and appends to `x-forwarded-for`. The OAuth rate limit
   * then keys on the entry that proxy appended; off by default, it keys on
   * the socket address only and clients behind a shared proxy share a budget.
   */
  trustProxy?: boolean;
}

export interface AuthConfig {
  jwtSecret: string;
  emailValidationTokenLifetime: number;
  passwordRecoverTokenLifetime: number;
  accessTokenLifetime: number;
  refreshTokenLifetime: number;
  userSensitiveKeys: string[];
  mustValidateEmail: boolean;
  oauth?: OAuthConfig;
}

export interface DmsMetaConfig {
  title?: string;
  description?: string;
}

export interface UploadsConfig {
  /**
   * Maximum size in bytes accepted by the presign endpoint. `0` (or less)
   * disables the cap entirely — the opt-out for deployments that legitimately
   * upload files larger than the default.
   */
  maxSize: number;
  /**
   * Optional global mimetype allowlist enforced at presign time (exact match).
   * Empty means no global mimetype restriction; when set, mimetypes not in the
   * list (including the empty mimetype of unknown-extension files) are rejected.
   * Per-field allowed mimetypes remain enforced at record-save time regardless.
   */
  allowedMimetypes: string[];
}

/**
 * How an unauthenticated caller of the layer endpoints is treated **on an
 * instance that configures no `bootstrapSecret`**.
 *
 * `warn` still serves them, minus every secret-bearing field, and logs once
 * per route. `enforce` refuses them outright, closing the routes to everyone
 * since nothing can authenticate.
 *
 * It has no say once a `bootstrapSecret` is configured: that alone refuses
 * unauthenticated callers.
 */
export type BootstrapEnforcement = "warn" | "enforce";

export interface FrontendConfig {
  /**
   * Credential the frontend build tool presents on `GET /dms/frontend` and
   * `GET /dms/frontend/modules`.
   *
   * Deliberately independent of `auth.jwtSecret` rather than derived from it:
   * this value lives on the build host, so it must not be a function of the
   * secret that signs session tokens, and it must be rotatable without
   * invalidating every session. Left unset in development, an ephemeral
   * per-process value is generated and published to the project's
   * `.antelope/dms-dev.json` for the local build tool to pick up.
   */
  bootstrapSecret?: string;
  /**
   * Only consulted when no {@link FrontendConfig.bootstrapSecret} is
   * configured. Defaults to `warn`.
   */
  requireBootstrap?: BootstrapEnforcement;
}

export interface Config {
  auth?: AuthConfig;
  htmlRender?: HtmlRenderConfig;
  homepage?: string;
  apiBaseUrl?: string;
  clientBaseUrl?: string;
  realtime?: RealtimeConfig;
  meta?: DmsMetaConfig;
  uploads?: Partial<UploadsConfig>;
  frontend?: FrontendConfig;
}

const REFRESH_TOKEN_LIFETIME_DAYS = 30;

let globalAuthConfig: AuthConfig = {
  jwtSecret: "",
  emailValidationTokenLifetime: MILLISECONDS_PER_DAY,
  passwordRecoverTokenLifetime: MILLISECONDS_PER_DAY,
  accessTokenLifetime: MILLISECONDS_PER_HOUR,
  refreshTokenLifetime: REFRESH_TOKEN_LIFETIME_DAYS * MILLISECONDS_PER_DAY,
  userSensitiveKeys: [],
  mustValidateEmail: false,
};

const SERVICE_TOKEN_LIFETIME_MINUTES = 5;

let globalHtmlRenderConfig: HtmlRenderConfig = {
  serviceSecret: "dev",
  serviceTokenLifetime:
    SERVICE_TOKEN_LIFETIME_MINUTES * MILLISECONDS_PER_MINUTE,
  renderEndpoint: "http://localhost:3001/api/html/render",
};

const BYTES_IN_KILOBYTE = 1024;
const KILOBYTES_IN_MEGABYTE = 1024;
const DEFAULT_MAX_UPLOAD_MEGABYTES = 100;
export const DEFAULT_MAX_UPLOAD_SIZE =
  DEFAULT_MAX_UPLOAD_MEGABYTES * KILOBYTES_IN_MEGABYTE * BYTES_IN_KILOBYTE;

let globalUploadsConfig: UploadsConfig = {
  maxSize: DEFAULT_MAX_UPLOAD_SIZE,
  allowedMimetypes: [],
};

let globalFrontendConfig: FrontendConfig = {
  requireBootstrap: "warn",
};

export const DEFAULT_CLIENT_BASE_URL = "http://localhost:3001";

let globalConfig: Config = {
  clientBaseUrl: DEFAULT_CLIENT_BASE_URL,
  apiBaseUrl: "http://127.0.0.1:5010",
};

let devClientBaseUrl: string | undefined;

export function getConfig(): Config {
  return globalConfig;
}

export function setDevClientBaseUrl(url: string): void {
  devClientBaseUrl = url;
}

export function getClientBaseUrl(): string | undefined {
  return devClientBaseUrl ?? globalConfig.clientBaseUrl;
}

export function getAuthConfig(): AuthConfig {
  return globalAuthConfig;
}

export function getHtmlRenderConfig(): HtmlRenderConfig {
  return globalHtmlRenderConfig;
}

export function getUploadsConfig(): UploadsConfig {
  return globalUploadsConfig;
}

export function getFrontendConfig(): FrontendConfig {
  return globalFrontendConfig;
}

/**
 * Merges the module configuration over the built-in defaults. Called once by
 * `construct()` when the module loads.
 */
export function applyConfig(config: Config): void {
  globalConfig = defu(config, globalConfig);

  if (config.auth) {
    globalAuthConfig = defu(config.auth, globalAuthConfig);
  }

  if (config.htmlRender) {
    globalHtmlRenderConfig = defu(config.htmlRender, globalHtmlRenderConfig);
  }

  if (config.uploads) {
    globalUploadsConfig = defu(config.uploads, globalUploadsConfig);
  }

  if (config.frontend) {
    globalFrontendConfig = defu(config.frontend, globalFrontendConfig);
  }
}

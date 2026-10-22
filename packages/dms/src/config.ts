import type { HtmlRenderConfig } from "@antelopejs/interface-dms/html-render";
import { defu } from "defu";
import type { RealtimeConfig } from "./realtime";
import {
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from "@antelopejs/interface-dms/utils/internal/time";

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
}

/** Where the "New sign-in" alert reads the country a sign-in came from. */
export interface SignInCountryConfig {
  /**
   * Request header a trusted reverse proxy fills with the client's ISO 3166-1
   * alpha-2 country code, such as `CF-IPCountry` behind Cloudflare. Unset by
   * default: any caller can write a header, so it is read only once named
   * here, and the proxy must overwrite it on every request. Wins over the
   * database lookup.
   */
  header?: string;
  /**
   * Path of a MaxMind-format country database (`.mmdb`) the client address is
   * looked up in when the header gives nothing. Defaults to the DB-IP Country
   * Lite database shipped with the package; `false` turns the lookup off.
   */
  database?: string | false;
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
  /**
   * Number of reverse proxies in front of the DMS API that append to
   * `x-forwarded-for`; the address recorded on a session (Profile › Sessions,
   * sign-in notices) is the one the outermost of them saw. `0`, the default,
   * records the socket peer and ignores the header, which any caller can
   * write.
   *
   * Count every hop between the browser and the API: the frontend server
   * relays the auth routes to the API and sets `x-forwarded-for` to the
   * client it resolved, so it is one hop, plus each proxy on its way to the
   * API (a CDN and an ingress when it reaches the API by its public URL).
   * Too low records a proxy address; too high trusts a client-supplied entry.
   */
  trustedProxies?: number;
  /**
   * Header the hosting platform overwrites on every request with the client's
   * address, such as `X-Client-IP` on AntelopeJS Cloud. When set, it gives the
   * client address and `trustedProxies` is not used: a request without a
   * valid address in it falls back to the socket peer. Set it only when the
   * platform guarantees that nothing but its gateway and the frontend server
   * reaches the API, since any other caller could write the header.
   */
  clientIpHeader?: string;
  /**
   * The country of a sign-in joins its device in the "New sign-in" check: the
   * same browser and system signing in from another country is a new sign-in.
   * Without a country (no header, no database entry for the address), the
   * device alone decides.
   */
  signInCountry?: SignInCountryConfig;
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
   * Credential the frontend tool presents on `GET /dms/frontend` (read by
   * `ajs dms dev`) and `POST /dms/frontend/ready` (sent by a frontend server
   * once it serves).
   *
   * Deliberately independent of `auth.jwtSecret` rather than derived from it:
   * this value lives on the frontend server, so it must not be a function of the
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

export interface StoreConfig {
  /**
   * Whether owners can install, update and remove modules from the Modules
   * page. Defaults to on in development and off in production, where a new
   * module also needs a frontend rebuild: the store then lists modules
   * read-only. What the store installed lives in antelope.config.ts, which
   * every environment loads.
   */
  enabled?: boolean;
  /**
   * Remote catalog of official modules, a JSON document shaped like the
   * bundled `data/module-store/catalog.json`. The bundled catalog is used when
   * unset or when the URL cannot be read.
   */
  catalogUrl?: string;
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
  store?: StoreConfig;
  /**
   * Serves `/dms-preview`, a public hidden page rendering any tree of
   * registered blocks it is handed, for documentation sites to embed. On in
   * development; elsewhere, requires `true` or `DMS_DOCS_PREVIEW=1`.
   * `false` does not override development mode or the environment opt-in.
   */
  docsPreview?: boolean;
}

const REFRESH_TOKEN_LIFETIME_DAYS = 30;
export const DEFAULT_ACCESS_TOKEN_LIFETIME = MILLISECONDS_PER_HOUR;

let globalAuthConfig: AuthConfig = {
  jwtSecret: "",
  emailValidationTokenLifetime: MILLISECONDS_PER_DAY,
  passwordRecoverTokenLifetime: MILLISECONDS_PER_DAY,
  accessTokenLifetime: DEFAULT_ACCESS_TOKEN_LIFETIME,
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
export const DEFAULT_API_BASE_URL = "http://127.0.0.1:5010";

let globalConfig: Config = {
  clientBaseUrl: DEFAULT_CLIENT_BASE_URL,
  apiBaseUrl: DEFAULT_API_BASE_URL,
};

let devClientBaseUrl: string | undefined;
let devApiBaseUrl: string | undefined;

export function getConfig(): Config {
  return globalConfig;
}

export function setDevClientBaseUrl(url: string): void {
  devClientBaseUrl = url;
}

export function getClientBaseUrl(): string | undefined {
  return devClientBaseUrl ?? globalConfig.clientBaseUrl;
}

/** `undefined` drops the dev override, back to the configured origin. */
export function setDevApiBaseUrl(url: string | undefined): void {
  devApiBaseUrl = url;
}

export function getApiBaseUrl(): string | undefined {
  return devApiBaseUrl ?? globalConfig.apiBaseUrl;
}

const DOCS_PREVIEW_ENV = "DMS_DOCS_PREVIEW";
const DOCS_PREVIEW_ENV_ENABLED = "1";

/** Whether `/dms-preview` is served, `dev` being the runtime's mode. */
export function isDocsPreviewEnabled(dev = false): boolean {
  return (
    dev ||
    globalConfig.docsPreview === true ||
    process.env[DOCS_PREVIEW_ENV] === DOCS_PREVIEW_ENV_ENABLED
  );
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

export function getStoreConfig(): StoreConfig {
  return globalConfig.store ?? {};
}

/** Whether owners may change modules from the store, `dev` being the runtime's mode. */
export function isStoreEditable(dev: boolean): boolean {
  return getStoreConfig().enabled ?? dev;
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

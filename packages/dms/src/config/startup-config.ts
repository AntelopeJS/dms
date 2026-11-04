import {
  DEFAULT_CLIENT_BASE_URL,
  getAuthConfig,
  getHtmlRenderConfig,
} from "./internal/state";

/** The value the playground and the DMS templates sign with in development. */
const PUBLIC_DEVELOPMENT_SECRET = "dev";

const HTTP_PROTOCOLS = ["http:", "https:"];
const ROOT_PATH = "/";

interface ProductionSecret {
  setting: string;
  /** Where a DMS project usually takes the value from. */
  source: string;
  purpose: string;
  read: () => string | undefined;
}

const PRODUCTION_SECRETS: ProductionSecret[] = [
  {
    setting: "auth.jwtSecret",
    source: "JWT_SECRET in the DMS templates",
    purpose: "it signs the dashboard's session tokens",
    read: () => getAuthConfig().jwtSecret,
  },
  {
    setting: "htmlRender.serviceSecret",
    source: "DMS_HTML_RENDER_SECRET, the same value the frontend server holds",
    purpose: "it signs the backend's calls to the frontend's HTML renderer",
    read: () => getHtmlRenderConfig().serviceSecret,
  },
];

function isPublicSecret(value: string | undefined): boolean {
  const secret = value?.trim();
  return !secret || secret === PUBLIC_DEVELOPMENT_SECRET;
}

/**
 * Refuses a production start on a missing secret or on the public
 * development one, with which anyone could forge what it signs.
 *
 * @throws When a secret is missing, empty or "dev"
 */
export function assertProductionSecrets(): void {
  const secret = PRODUCTION_SECRETS.find(({ read }) => isPublicSecret(read()));
  if (!secret) return;
  throw new Error(
    `[DMS] ${secret.setting} is required in production (set it from ${secret.source}): ${secret.purpose}, and an empty or "${PUBLIC_DEVELOPMENT_SECRET}" value lets anyone forge them.`,
  );
}

function invalidClientBaseUrl(raw: string): Error {
  return new Error(
    `[DMS] clientBaseUrl must be the dashboard's http(s) origin, such as https://dashboard.example.com, without a path or parameters; got "${raw}".`,
  );
}

function parseClientOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalidClientBaseUrl(raw);
  }
  const isOrigin =
    url.pathname === ROOT_PATH &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password;
  if (!HTTP_PROTOCOLS.includes(url.protocol) || !isOrigin) {
    throw invalidClientBaseUrl(raw);
  }
  return url.origin;
}

/**
 * The dashboard's origin: the configured one, else the local development
 * server's in development. Production has no default: e-mail links,
 * redirects and CORS all start from it.
 *
 * @throws When the value is not an http(s) origin, or is missing in production
 */
export function resolveClientBaseUrl(
  raw: string | undefined,
  dev: boolean,
): string {
  const value = raw?.trim();
  if (value) return parseClientOrigin(value);
  if (dev) return DEFAULT_CLIENT_BASE_URL;
  throw new Error(
    "[DMS] clientBaseUrl is required in production (set it from DMS_CLIENT_BASE_URL in the DMS templates): e-mail links, payment redirects and CORS start from the dashboard's origin, and the development one is localhost.",
  );
}

const MIN_SETUP_TOKEN_LENGTH = 16;

/**
 * The setup token the deployment configured through `DMS_SETUP_TOKEN`, if any.
 *
 * @throws When the value is shorter than 16 characters, which anyone could guess
 */
export function resolveConfiguredSetupToken(): string | undefined {
  const value = process.env.DMS_SETUP_TOKEN?.trim();
  if (!value) return undefined;
  if (value.length < MIN_SETUP_TOKEN_LENGTH) {
    throw new Error(
      `[DMS] DMS_SETUP_TOKEN must be at least ${MIN_SETUP_TOKEN_LENGTH} characters: it is the only proof that the first owner registration comes from whoever deployed the instance.`,
    );
  }
  return value;
}

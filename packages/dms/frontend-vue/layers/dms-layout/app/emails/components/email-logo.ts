/**
 * Which logo URL an email may carry. A recipient's mail client fetches the
 * image from the internet, so it needs an absolute public http(s) URL; Gmail
 * and Outlook also refuse SVG. A logo that fails either test is left out
 * rather than drawn as a broken image.
 */

const ROOT_PATH = "/";
const WEB_PROTOCOLS = ["http:", "https:"];
const SVG_PATH = /\.svg(?:[?#]|$)/i;
const LOCAL_HOSTS = ["localhost", "0.0.0.0", "[::]", "[::1]"];
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal"];
const PRIVATE_ADDRESSES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[f[cd][0-9a-f]{0,2}:/i,
  /^\[fe[89ab][0-9a-f]:/i,
];

function absoluteUrl(path: string, clientBaseUrl: string): URL | null {
  const source = path.startsWith(ROOT_PATH) ? `${clientBaseUrl}${path}` : path;
  try {
    return new URL(source);
  } catch {
    return null;
  }
}

/** Whether a mail client out on the internet can reach `hostname`. */
export function isPublicEmailHost(hostname: string): boolean {
  const name = hostname.toLowerCase();
  if (LOCAL_HOSTS.includes(name)) return false;
  if (LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix))) return false;
  return !PRIVATE_ADDRESSES.some((pattern) => pattern.test(name));
}

/**
 * The logo URL an email may use: `logoPath` made absolute against
 * `clientBaseUrl` when it starts with `/`, or `""` when it is an SVG, not
 * http(s), or served from a host a mail client cannot reach (localhost, a
 * private address).
 */
export function emailLogoUrl(
  logoPath: string | undefined,
  clientBaseUrl: string,
): string {
  if (!logoPath || SVG_PATH.test(logoPath)) return "";
  const url = absoluteUrl(logoPath, clientBaseUrl);
  if (!url || !WEB_PROTOCOLS.includes(url.protocol)) return "";
  return isPublicEmailHost(url.hostname) ? url.href : "";
}

// A fetch failure names the request it failed: `[GET] "http://10.0.0.4:5010/
// dms/page?path=/x": 502 Bad Gateway`. On a server, that is the backend's
// internal address, which an error page must never show.
const FETCH_FAILURE = /^\[[A-Z]+\]\s+"[^"]*":\s*(.*)$/s;
const ABSOLUTE_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi;
const SPACES = /\s{2,}/g;

/**
 * The part of an error's message a page may show: a fetch failure's status
 * text alone, and no absolute URL anywhere; nothing when nothing is left.
 */
export function publicErrorMessage(
  message: string | undefined,
): string | undefined {
  if (!message) return undefined;
  const statusText = FETCH_FAILURE.exec(message)?.[1] ?? message;
  const shown = statusText.replace(ABSOLUTE_URL, "").replace(SPACES, " ");
  return shown.trim() || undefined;
}

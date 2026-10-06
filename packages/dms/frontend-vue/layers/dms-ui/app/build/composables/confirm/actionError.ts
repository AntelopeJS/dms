import {
  readTranslationKey,
  type I18nTranslate,
} from "#dms-core/app/composables/translation/useTranslation";

/** Shown when the request never reached the server (offline, DNS, CORS…). */
export const ACTION_ERROR_NETWORK_KEY = "error.network.description";
/** Shown for a 401/403 whose body is not a user-facing message. */
export const ACTION_ERROR_FORBIDDEN_KEY = "dms.action_error.forbidden";
/** Shown when the server's message is missing or not meant for users. */
export const ACTION_ERROR_GENERIC_KEY = "dms.action_error.generic";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_SERVER_ERROR = 500;
// Longer than a sentence or two: a dump, not a message.
const MAX_MESSAGE_LENGTH = 300;
// `error.not_found`, `$page.settings.invites.error.expired`.
const KEY_PATTERN = /^\$?[\w-]+(\.[\w-]+)+$/;
// JSON, HTML, a stack trace or a thrown `TypeError: …`.
const TECHNICAL_PATTERNS = [
  /^\s*[[{<]/,
  /\n\s*at\s/,
  /^\s*[A-Z]\w*Error\b/,
  /<no response>/,
];
// What browsers say when `fetch` itself fails.
const NETWORK_MESSAGES = [/failed to fetch/i, /networkerror/i, /load failed/i];

interface FetchErrorLike {
  name?: string;
  message?: string;
  statusCode?: number;
  status?: number;
  response?: { status?: number };
  data?: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// An ofetch `FetchError` (or anything shaped like a failed request): its own
// `message` is the raw "[DELETE] "/api/…": 403 Forbidden" line, never shown.
const isFetchError = (error: unknown): error is FetchErrorLike =>
  isObject(error) &&
  (error.name === "FetchError" ||
    "statusCode" in error ||
    "response" in error ||
    "data" in error);

const statusOf = (error: FetchErrorLike): number | undefined =>
  error.statusCode ?? error.status ?? error.response?.status;

/** The message the server put in the error body, when it sent one. */
const serverMessageOf = (error: FetchErrorLike): string | undefined => {
  const { data } = error;
  if (typeof data === "string") return data;
  if (isObject(data) && typeof data.message === "string") return data.message;
  return undefined;
};

const isTechnical = (text: string) =>
  text.length > MAX_MESSAGE_LENGTH ||
  TECHNICAL_PATTERNS.some((pattern) => pattern.test(text));

/**
 * `text` as the user should read it: a translated i18n key, or plain prose
 * as it came. Undefined when it is not user-facing (an untranslated key, JSON,
 * a stack trace…), for the caller to fall back on a generic message.
 */
const userFacingText = (
  text: string | undefined,
  translate: I18nTranslate,
): string | undefined => {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  const { key } = readTranslationKey(trimmed);
  if (KEY_PATTERN.test(trimmed)) {
    const translated = translate(key, {});
    return translated !== key ? translated : undefined;
  }
  return isTechnical(trimmed) ? undefined : trimmed;
};

const translateKey = (translate: I18nTranslate, key: string) =>
  translate(key, {});

/**
 * The message telling a user why an action failed, from whatever the request
 * threw: the server's own message when it is user-facing (an i18n key, or
 * plain text on a 4xx), else a translated fallback: the request never got
 * through, it was refused for lack of permission, or something went wrong.
 * Never a stack trace, raw JSON or an ofetch error line.
 */
export function resolveActionError(
  error: unknown,
  translate: I18nTranslate,
): string {
  if (isFetchError(error)) {
    const status = statusOf(error);
    if (status === undefined) {
      return translateKey(translate, ACTION_ERROR_NETWORK_KEY);
    }
    const raw = serverMessageOf(error);
    const isForbidden =
      status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN;
    // Plain text on a refusal or a crash is the server talking to developers
    // ("Forbidden: missing permission …", "Archive field not configured"):
    // only a translated key gets through there.
    if (isForbidden || status >= HTTP_SERVER_ERROR) {
      const translated =
        raw && KEY_PATTERN.test(raw.trim())
          ? userFacingText(raw, translate)
          : undefined;
      return (
        translated ??
        translateKey(
          translate,
          isForbidden ? ACTION_ERROR_FORBIDDEN_KEY : ACTION_ERROR_GENERIC_KEY,
        )
      );
    }
    return (
      userFacingText(raw, translate) ??
      translateKey(translate, ACTION_ERROR_GENERIC_KEY)
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : undefined;
  if (message && NETWORK_MESSAGES.some((pattern) => pattern.test(message))) {
    return translateKey(translate, ACTION_ERROR_NETWORK_KEY);
  }
  return (
    userFacingText(message, translate) ??
    translateKey(translate, ACTION_ERROR_GENERIC_KEY)
  );
}

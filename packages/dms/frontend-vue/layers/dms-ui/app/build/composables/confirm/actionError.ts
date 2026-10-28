import {
  isObject as isObjectType,
  isString,
} from "../../../../../dms-core/app/utils/type-check";
import {
  readTranslationKey,
  type I18nTranslate,
} from "#dms-core/app/composables/translation/useTranslation";
import { describeFieldErrors } from "#dms-core/app/composables/useFieldErrors";

/** Shown when the request never reached the server (offline, DNS, CORS…). */
export const ACTION_ERROR_NETWORK_KEY = "error.network.description";
/** Shown for a 401/403 whose body is not a user-facing message. */
export const ACTION_ERROR_FORBIDDEN_KEY = "dms.action_error.forbidden";
/** Shown when the server's message is missing or not meant for users. */
export const ACTION_ERROR_GENERIC_KEY = "dms.action_error.generic";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_SERVER_ERROR = 500;

const MAX_MESSAGE_LENGTH = 300;

const KEY_PATTERN = /^\$?[\w-]+(\.[\w-]+)+$/;

const TECHNICAL_PATTERNS = [
  /^\s*[[{<]/,
  /\n\s*at\s/,
  /^\s*[A-Z]\w*Error\b/,
  /<no response>/,
];

const NETWORK_MESSAGES = [/failed to fetch/i, /networkerror/i, /load failed/i];

interface FetchErrorLike {
  name?: string;
  message?: string;
  statusCode?: number;
  status?: number;
  response?: { status?: number };
  data?: unknown;
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Error bodies are untrusted; property values remain unknown until their individual checks.
const isObject = (value: unknown): value is Record<string, unknown> =>
  isObjectType(value) && value !== null;

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
  if (isString(data)) return data;
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The object guard accepts all untrusted error data; only an actual string message is returned.
  if (isObject(data) && isString(data.message)) return data.message;
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
export const userFacingText = (
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
 * Never a stack trace, raw JSON or an ofetch error line. A body the data API
 * refused for some fields names them by `labelOf` ("Loss reason is
 * required."): a table view's write passes its column labels.
 */
export function resolveActionError(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The request's catch value is decoded here and may be any thrown JavaScript value.
  error: unknown,
  translate: I18nTranslate,
  labelOf: (field: string) => string | undefined = () => undefined,
): string {
  if (isFetchError(error)) {
    const status = statusOf(error);
    if (status === undefined) {
      return translateKey(translate, ACTION_ERROR_NETWORK_KEY);
    }
    const raw = serverMessageOf(error);
    const isForbidden =
      status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN;

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
      describeFieldErrors(error, translate, labelOf) ??
      userFacingText(raw, translate) ??
      translateKey(translate, ACTION_ERROR_GENERIC_KEY)
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : isString(error)
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

import {
  isObject as isObjectType,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import { HTTP_NOT_FOUND } from "../../../../dms-core/app/utils/http-status";
import type { I18nTranslate } from "#dms-core/app/composables/translation/useTranslation";
import type { BlockAction } from "../components/blocks/BlockActions.vue";
import type { ApiErrorPresenter } from "#dms-core/app/composables/useApiErrorPresenter";
import type { Tone } from "#dms-core/app/types/tone";

/** Translation key of the not-found title, shared by blocks and guards. */
export const NOT_FOUND_TITLE_KEY = "dms.blocks.not_found";
/** Translation key of the not-found hint, when the 404 says nothing usable. */
export const NOT_FOUND_HINT_KEY = "dms.blocks.not_found_hint";

/** What the body of a 404 may lay over a not-found state. */
export interface NotFoundEmptyState {
  title?: string;
  description?: string;
  icon?: string;
  tone?: Tone;
  actions?: BlockAction[];
}

/**
 * What a data source answering 404 says about it, read from the error body:
 * `{ message?, emptyState? }`, both optional.
 */
export interface FetchNotFound {
  /** The body's `message`: an i18n key or a sentence for the user. */
  message?: string;
  /** Laid over the not-found state drawn (title, icon, actions…). */
  emptyState?: NotFoundEmptyState;
}

interface FetchFailure {
  statusCode?: number;
  status?: number;
  response?: { status?: number; _data?: unknown };
  data?: unknown;
}

/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- This representation guard accepts arbitrary thrown and response values; FetchFailure cannot replace the open property lookup result. */
const isObject = (
  value: Parameters<typeof isObjectType>[0],
): value is Record<string, unknown> => isObjectType(value) && value !== null;
/* oxlint-enable anti-slop/no-unsafe-dictionary-type */

const statusOf = (error: FetchFailure): number | undefined =>
  error.statusCode ?? error.status ?? error.response?.status;

/**
 * The not-found answer a failed request carries, or `null` when it failed any
 * other way (network, refusal, crash): a 404 is the server's final word that
 * what is read does not exist, not a load error to retry.
 */
export function readFetchNotFound(
  error: Parameters<typeof isObject>[0],
): FetchNotFound | null {
  if (!isObject(error)) return null;
  const failure: Parameters<typeof statusOf>[0] = error;
  if (statusOf(failure) !== HTTP_NOT_FOUND) return null;
  const data = failure.data ?? failure.response?._data;
  const body = isObject(data) ? data : {};
  return {
    message: isString(body.message) ? body.message : undefined,
    emptyState: isObject(body.emptyState) ? body.emptyState : undefined,
  };
}

/**
 * The default texts of a not-found state, before the 404's `emptyState` is
 * laid over them: a translated "Not found", and the body's `message` when it
 * is user-facing, else a translated hint. A block and a `Guard` draw the same.
 */
export function notFoundTexts(
  notFound: FetchNotFound | null | undefined,
  translate: I18nTranslate,
  resolveError: ApiErrorPresenter["resolveError"],
) {
  return {
    title: translate(NOT_FOUND_TITLE_KEY, {}),
    description:
      resolveError(notFound?.message, { fallbackKey: NOT_FOUND_HINT_KEY })
        ?.message ?? translate(NOT_FOUND_HINT_KEY, {}),
  };
}

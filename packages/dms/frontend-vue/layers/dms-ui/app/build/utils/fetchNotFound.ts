import { HTTP_NOT_FOUND } from "../../../../dms-core/app/utils/http-status";
import type { EmptyWhenState } from "../composables/blocks/useEmptyWhen";

/**
 * What a data source answering 404 says about it, read from the error body:
 * `{ message?, emptyState? }`, both optional.
 */
export interface FetchNotFound {
  /** The body's `message`: an i18n key or a sentence for the user. */
  message?: string;
  /** Laid over the not-found state the block draws (title, icon, actions…). */
  emptyState?: Partial<EmptyWhenState>;
}

interface FetchFailure {
  statusCode?: number;
  status?: number;
  response?: { status?: number };
  data?: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const statusOf = (error: FetchFailure): number | undefined =>
  error.statusCode ?? error.status ?? error.response?.status;

/**
 * The not-found answer a failed request carries, or `null` when it failed any
 * other way (network, refusal, crash): a 404 is the server's final word that
 * what the block reads does not exist, not a load error to retry.
 */
export function readFetchNotFound(error: unknown): FetchNotFound | null {
  if (!isObject(error)) return null;
  const failure = error as FetchFailure;
  if (statusOf(failure) !== HTTP_NOT_FOUND) return null;
  const body = isObject(failure.data) ? failure.data : {};
  return {
    message: typeof body.message === "string" ? body.message : undefined,
    emptyState: isObject(body.emptyState)
      ? (body.emptyState as Partial<EmptyWhenState>)
      : undefined,
  };
}

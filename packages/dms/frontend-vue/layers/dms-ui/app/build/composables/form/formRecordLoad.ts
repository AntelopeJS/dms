import { type Ref, ref } from "vue";
import { apiErrorStatus } from "#dms-core/app/composables/useFieldErrors";
import { HTTP_FORBIDDEN } from "#dms-core/app/utils/http-status";

/**
 * Why a form could not load the record it edits: `forbidden` when the server
 * refused the caller the read (a role that may edit rows but not view them),
 * `missing` when its address lacks the record's id (a page reached without
 * its `?id=`), `error` for anything else (a network failure, a server error,
 * a row gone).
 */
export type FormLoadFailure = "forbidden" | "missing" | "error";

/** What a form knows of the record it is about, as far as `missing` goes. */
export interface FormRecordAddress {
  requiresRecord?: boolean;
  fetchUrl?: string;
  /** `fetchUrl` with its route values filled; unset while one is missing. */
  resolvedFetchUrl?: string;
}

/**
 * `missing` for a form about one record whose address names no record yet:
 * its fields would only hold their defaults, which read as a record.
 */
export function missingRecordFailure(
  address: FormRecordAddress,
): FormLoadFailure | null {
  const isMissing =
    !!address.requiresRecord &&
    !!address.fetchUrl &&
    !address.resolvedFetchUrl;
  return isMissing ? "missing" : null;
}

/** The cached load of a form's record (`useDmsAsyncData`), as far as it is read. */
export interface FormLoadSource<T> {
  data: Ref<T | null>;
  error: Ref<unknown>;
  refresh(): Promise<void>;
}

/** Where a form stands with the record it loads, and how to try again. */
export interface FormRecordLoad {
  /** Set while the last load failed: the form shows it instead of its fields. */
  failure: Ref<FormLoadFailure | null>;
  /** Set while `retry` loads the record again. */
  retrying: Ref<boolean>;
  /** Load the record again; the form opens on it once it arrives. */
  retry(): Promise<void>;
}

/** The failure a load error stands for; `null` when there is none. */
export function formLoadFailure(error: unknown): FormLoadFailure | null {
  if (!error) return null;
  return apiErrorStatus(error) === HTTP_FORBIDDEN ? "forbidden" : "error";
}

/**
 * Follow a form's record load: `apply` receives the record once it loaded,
 * and only then. A failed load is never applied, not even the values a
 * previous opening left in the cache: a form showing them, or its defaults,
 * would read as the record and save over it.
 */
export function trackFormRecordLoad<T>(
  load: FormLoadSource<T>,
  apply: (payload: T) => void,
): FormRecordLoad {
  const failure = ref<FormLoadFailure | null>(null);
  const retrying = ref(false);
  const settle = (): void => {
    failure.value = formLoadFailure(load.error.value);
    const payload = load.data.value;
    if (!failure.value && payload) apply(payload);
  };
  settle();
  return {
    failure,
    retrying,
    async retry() {
      retrying.value = true;
      try {
        await load.refresh();
      } finally {
        retrying.value = false;
      }
      settle();
    },
  };
}

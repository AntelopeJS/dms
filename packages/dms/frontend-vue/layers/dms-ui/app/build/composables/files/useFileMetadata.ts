import {
  effectScope,
  getCurrentInstance,
  inject,
  onScopeDispose,
  shallowReactive,
  watch,
} from "vue";
import { FORM_CONTENT_LANGUAGE_KEY } from "../../../composables/form/types/content-language";
import {
  isDefinitiveMetadataFailure,
  resolveMetadataRetryDelay,
} from "../../../utils/metadataRetry";

/** What `/api/files/metadata` answers for a stored file. */
export interface FileMetadata {
  resourceKey: string;
  filename: string;
  size: number;
  mimetype: string;
  url: string;
  /** When `url` stops working, in milliseconds since the epoch. */
  expiresAt?: number;
}

const METADATA_URL = "/api/files/metadata";
// A read URL is read again this long before it expires.
const URL_REFRESH_LEAD_MS = 5000;

const isExpired = (metadata: FileMetadata): boolean =>
  metadata.expiresAt !== undefined && metadata.expiresAt <= Date.now();

/**
 * The metadata of stored files (name, size, type, read URL), one read per
 * file key, shared by every component showing that file.
 *
 * A key resolved during a component's setup (directly, or from an immediate
 * watcher) is read with the page: a server render waits for it and hands it
 * to the browser, which does not ask again. A key resolved later (a new
 * value, an upload) is read in the browser. While a component shows a file,
 * its URL is read again before it expires, and a failed read that may heal
 * (network, 5xx, rate limiting) is retried with a growing delay; a refused or
 * missing file (another 4xx) is not.
 *
 * @param storage The storage the keys live in (the field's `storage`)
 */
export function useFileMetadata(storage?: string) {
  const contentLanguage = inject(FORM_CONTENT_LANGUAGE_KEY, undefined);
  // Reads resolved past the setup run with the application's context.
  const app = getCurrentInstance()?.appContext.app;
  const scope = effectScope();
  const reads = shallowReactive(new Map<string, ApiDataResult<FileMetadata>>());
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const failures = new Map<string, number>();

  function schedule(key: string, delay: number, read: () => Promise<void>) {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void read();
      }, delay),
    );
  }

  /** The next read of `key` its last answer calls for, in the browser. */
  function follow(key: string, result: ApiDataResult<FileMetadata>): void {
    const refresh = () => result.refresh({ dedupe: "defer" });
    watch(
      [result.data, result.error, result.status],
      ([metadata, error, status]) => {
        if (status === "pending" || status === "idle") return;
        clearTimeout(timers.get(key));
        if (error) {
          const attempts = (failures.get(key) ?? 0) + 1;
          failures.set(key, attempts);
          const delay = resolveMetadataRetryDelay(error, attempts);
          if (delay !== null) schedule(key, delay, refresh);
          return;
        }
        failures.delete(key);
        if (metadata?.expiresAt === undefined) return;
        const remaining = Math.max(metadata.expiresAt - Date.now(), 0);
        const lead = Math.min(URL_REFRESH_LEAD_MS, remaining / 2);
        schedule(key, remaining - lead, refresh);
      },
      { immediate: true },
    );
  }

  function readOf(key: string): ApiDataResult<FileMetadata> {
    const known = reads.get(key);
    if (known) return known;
    const read = () =>
      useApiData<FileMetadata>(
        `dms-file-metadata:${storage ?? ""}:${contentLanguage ?? ""}:${key}`,
        ({ $authFetch, signal }) =>
          $authFetch<FileMetadata>(METADATA_URL, {
            query: { resourceKey: key, storage },
            headers: contentLanguage
              ? { [CONTENT_LANGUAGE_HEADER]: contentLanguage }
              : undefined,
            signal,
          }),
      );
    const result = scope.run(() => {
      const started =
        getCurrentInstance() || !app ? read() : app.runWithContext(read);
      if (!import.meta.env.SSR) follow(key, started);
      return started;
    })!;
    reads.set(key, result);
    return result;
  }

  /**
   * Reads `key`'s metadata unless it is known; `force` reads it again (to
   * open a file with a fresh URL).
   */
  async function resolve(key: string, force = false): Promise<void> {
    const result = readOf(key);
    if (force) await result.refresh({ dedupe: "defer" });
    else await result;
  }

  /** The last metadata read for `key`, its URL possibly expired. */
  const lastRead = (key: string): FileMetadata | undefined =>
    reads.get(key)?.data.value ?? undefined;

  /**
   * Whether `key` cannot be shown: its last read failed and the server
   * refused it for good, or nothing usable is left (never read, or expired).
   */
  function isUnavailable(key: string): boolean {
    const result = reads.get(key);
    // A failure stays until the next answer: a retry keeps the file marked.
    if (!result?.error.value) return false;
    const known = result.data.value;
    return (
      !known ||
      isExpired(known) ||
      isDefinitiveMetadataFailure(result.error.value)
    );
  }

  /** The metadata to show for `key`: read, not expired, still available. */
  function metadata(key: string): FileMetadata | undefined {
    const known = lastRead(key);
    return known && !isExpired(known) && !isUnavailable(key)
      ? known
      : undefined;
  }

  onScopeDispose(() => {
    scope.stop();
    timers.forEach(clearTimeout);
    timers.clear();
  });

  return { resolve, metadata, lastRead, isUnavailable };
}

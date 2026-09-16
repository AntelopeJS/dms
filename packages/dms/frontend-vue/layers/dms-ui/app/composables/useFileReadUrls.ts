import { FORM_CONTENT_LANGUAGE_KEY } from "./form/types/content-language";

interface FileMetadataUrlResponse {
  url: string;
  expiresAt?: number;
}

type CachedFileReadUrl = FileMetadataUrlResponse;

const URL_REFRESH_LEAD_MS = 5000;
const RETRY_DELAY_MS = 5000;

/**
 * Resolves stored file resource keys to read URLs through
 * `/api/files/metadata`. Expiring URLs refresh while visible, and failed
 * lookups remain retryable instead of permanently hiding the file.
 */
export function useFileReadUrls(storage?: string) {
  const { $authFetch } = useAuthFetch();
  const contentLanguage = inject(FORM_CONTENT_LANGUAGE_KEY, undefined);
  const urls = ref<Map<string, CachedFileReadUrl>>(new Map());
  const pendingKeys = new Set<string>();
  const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let isDisposed = false;

  function isFresh(metadata: CachedFileReadUrl): boolean {
    return (
      metadata.expiresAt === undefined ||
      metadata.expiresAt - URL_REFRESH_LEAD_MS > Date.now()
    );
  }

  function scheduleRefresh(key: string, expiresAt?: number): void {
    if (isDisposed || import.meta.env.SSR) return;
    const currentTimer = refreshTimers.get(key);
    if (currentTimer) clearTimeout(currentTimer);
    if (expiresAt === undefined) return;
    const remaining = Math.max(expiresAt - Date.now(), 0);
    const refreshLead = Math.min(URL_REFRESH_LEAD_MS, remaining / 2);
    const delay = Math.max(remaining - refreshLead, 0);
    refreshTimers.set(
      key,
      setTimeout(() => resolve(key, true), delay),
    );
  }

  async function resolve(key: string, force = false): Promise<void> {
    if (isDisposed) return;
    const cached = urls.value.get(key);
    if (!force && cached && isFresh(cached)) return;
    if (pendingKeys.has(key)) return;

    pendingKeys.add(key);
    try {
      const metadata = await $authFetch<FileMetadataUrlResponse>(
        "/api/files/metadata",
        {
          query: { resourceKey: key, storage },
          headers: contentLanguage
            ? { [CONTENT_LANGUAGE_HEADER]: contentLanguage }
            : undefined,
        },
      );
      if (isDisposed) return;
      urls.value.set(key, metadata);
      scheduleRefresh(key, metadata.expiresAt);
    } catch {
      if (isDisposed) return;
      if (cached?.expiresAt !== undefined && cached.expiresAt <= Date.now()) {
        urls.value.delete(key);
      } else if (cached?.expiresAt !== undefined) {
        scheduleRefresh(key, cached.expiresAt);
      }
      if (
        !import.meta.env.SSR &&
        (!cached ||
          (cached.expiresAt !== undefined && cached.expiresAt <= Date.now()))
      ) {
        refreshTimers.set(
          key,
          setTimeout(() => resolve(key, true), RETRY_DELAY_MS),
        );
      }
    }
    pendingKeys.delete(key);
  }

  function getUrl(key: string): string | undefined {
    const metadata = urls.value.get(key);
    if (
      !metadata ||
      (metadata.expiresAt !== undefined && metadata.expiresAt <= Date.now())
    ) {
      return undefined;
    }
    return metadata.url;
  }

  onScopeDispose(() => {
    isDisposed = true;
    refreshTimers.forEach(clearTimeout);
  });

  return { getUrl, resolve };
}

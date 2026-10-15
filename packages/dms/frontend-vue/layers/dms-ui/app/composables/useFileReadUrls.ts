import { useFileMetadata } from "../build/composables/files/useFileMetadata";

/**
 * Resolves stored file resource keys to read URLs through
 * `/api/files/metadata`. A key resolved during the setup (an immediate
 * watcher) is read with the page, the server render included; expiring URLs
 * refresh while visible, and failed lookups that may heal are retried
 * instead of permanently hiding the file.
 */
export function useFileReadUrls(storage?: string) {
  const files = useFileMetadata(storage);
  return {
    /** The URL to show `key` with, until it expires; undefined until read. */
    getUrl: (key: string): string | undefined => files.metadata(key)?.url,
    resolve: (key: string): Promise<void> => files.resolve(key),
  };
}

import { isObject, isString } from "#dms-core/app/utils/type-check";

const FROM_PAGE_ENDPOINT = "/api/mockup/from-page";

type Fetch = (
  url: string,
  options: { method: "POST"; body: Record<string, unknown> },
) => Promise<Parameters<typeof isObject>[0]>;

interface FromPageAnswer {
  url: string;
  stale: boolean;
  digest?: string;
}

function parseAnswer(
  value: Parameters<typeof isObject>[0],
): FromPageAnswer | undefined {
  if (!isObject(value) || value === null || Array.isArray(value)) {
    return undefined;
  }
  const { url, stale, digest } = value;
  if (!isString(url)) return undefined;
  return {
    url,
    stale: stale === true,
    digest: isString(digest) ? digest : undefined,
  };
}

/**
 * Converts the page at `path` again over its linked page of `mockup`, and
 * answers the viewer URL of that page. Only that page of the mockup changes.
 */
export async function resyncFromPage(
  fetch: Fetch,
  mockup: string,
  path: string,
): Promise<string> {
  const opened = parseAnswer(
    await fetch(FROM_PAGE_ENDPOINT, {
      method: "POST",
      body: { path, mockup },
    }),
  );
  if (!opened) throw new Error("Unexpected answer from the mockup API");
  if (!opened.stale || opened.digest === undefined) return opened.url;
  const replaced = parseAnswer(
    await fetch(FROM_PAGE_ENDPOINT, {
      method: "POST",
      body: { path, mockup, replace: true, digest: opened.digest },
    }),
  );
  if (!replaced) throw new Error("Unexpected answer from the mockup API");
  return replaced.url;
}

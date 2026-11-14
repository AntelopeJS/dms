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
 * Brings the mockup of the page at `path` up to date with the page, and
 * answers the viewer URL of that mockup. The page's mockup is converted from
 * the page when it has none, and converted again over the one it has when the
 * page changed since.
 */
export async function resyncFromPage(
  fetch: Fetch,
  path: string,
): Promise<string> {
  const opened = parseAnswer(
    await fetch(FROM_PAGE_ENDPOINT, { method: "POST", body: { path } }),
  );
  if (!opened) throw new Error("Unexpected answer from the mockup API");
  if (!opened.stale || opened.digest === undefined) return opened.url;
  const replaced = parseAnswer(
    await fetch(FROM_PAGE_ENDPOINT, {
      method: "POST",
      body: { path, replace: true, digest: opened.digest },
    }),
  );
  if (!replaced) throw new Error("Unexpected answer from the mockup API");
  return replaced.url;
}

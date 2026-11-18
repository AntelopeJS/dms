import { isObject, isString } from "#dms-core/app/utils/type-check";

/** The stream of the mockups that get created, under the backend's base URL. */
export const CREATED_ENDPOINT = "/api/mockup/events/created";

/** The event that stream sends for each mockup whose spec did not exist before. */
export const CREATED_EVENT = "created";

const REOPEN_DELAY_MS = 2000;
const TRAILING_SLASHES = /\/+$/;

/** A mockup that was created: its folder name, and its title when its spec has one. */
export interface CreatedMockup {
  name: string;
  title?: string;
}

/** What the dashboard does about a created mockup. */
export type CreatedReaction =
  | { kind: "navigate"; path: string }
  | { kind: "toast"; title: string; path: string };

/** The viewer of the mockup called `name`. */
export function viewerPath(name: string): string {
  return `/mockup?name=${encodeURIComponent(name)}`;
}

/** The text of a `created` event as a {@link CreatedMockup}; undefined when it is not one. */
export function parseCreated(data: string): CreatedMockup | undefined {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!isObject(value) || value === null) return undefined;
  const { name, title } = value;
  if (!isString(name) || name === "") return undefined;
  return isString(title) && title !== "" ? { name, title } : { name };
}

/**
 * Whether `path` is the Mockups list page: the one place a created mockup
 * opens by itself. A trailing slash and the query do not matter.
 */
export function isOnList(path: string, listPath: string): boolean {
  return path.replace(TRAILING_SLASHES, "") === listPath;
}

/**
 * What to do about `created` while the dashboard shows `currentPath`: open
 * its viewer from the Mockups list page, where the user asked for it, and
 * anywhere else leave the user where they are and offer it.
 */
export function reactionTo(
  created: CreatedMockup,
  currentPath: string,
  listPath: string,
): CreatedReaction {
  const path = viewerPath(created.name);
  return isOnList(currentPath, listPath)
    ? { kind: "navigate", path }
    : { kind: "toast", title: created.title ?? created.name, path };
}

export interface CreatedStream {
  close: () => void;
}

/**
 * Keeps one stream open to the created mockups for as long as it is not
 * closed, and calls `onCreated` for each valid `created` event. The browser
 * reconnects a dropped connection by itself; this reopens one the backend
 * refused, as a restart does.
 */
export function openCreatedStream(
  endpoint: string,
  onCreated: (created: CreatedMockup) => void,
): CreatedStream {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;

  function open(): void {
    if (isClosed) return;
    source?.close();
    const next = new EventSource(endpoint);
    source = next;
    next.addEventListener("error", () => {
      if (next.readyState !== EventSource.CLOSED || timer || isClosed) return;
      timer = setTimeout(() => {
        timer = null;
        open();
      }, REOPEN_DELAY_MS);
    });
    next.addEventListener(CREATED_EVENT, (event) => {
      if (!(event instanceof MessageEvent) || !isString(event.data)) return;
      const created = parseCreated(event.data);
      if (created) onCreated(created);
    });
  }

  open();
  return {
    close: () => {
      isClosed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      source?.close();
    },
  };
}

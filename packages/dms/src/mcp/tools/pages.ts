import { z } from "zod";
import { DEFAULT_CLIENT_BASE_URL, getClientBaseUrl } from "../../config";
import { pagesBySlug } from "../../utils";
import { sendToLeaderTabs } from "../../realtime";
import { defineTool, textResult } from "../tool";

const DMS_MODULE_ID = "dms";
const SUGGESTION_LIMIT = 20;
const PARAM_PREFIX = ":";

/** A route as `/a/b`: no query, no hash, one leading slash, no trailing one. */
export function normalizeRoute(path: string): string {
  const pathOnly = path.split(/[?#]/, 1)[0] ?? path;
  return `/${pathOnly.replace(/^\/+|\/+$/g, "")}`;
}

/** Whether a page registered at `slug` (`:name` segments included) serves `path`. */
export function servesRoute(slug: string, path: string): boolean {
  const slugSegments = normalizeRoute(slug).split("/");
  const pathSegments = path.split("/");
  return (
    slugSegments.length === pathSegments.length &&
    slugSegments.every(
      (segment, index) =>
        segment === pathSegments[index] ||
        (segment.startsWith(PARAM_PREFIX) && pathSegments[index] !== ""),
    )
  );
}

const listPages = defineTool({
  name: "list_pages",
  title: "List pages",
  description:
    "Returns all registered DMS pages as {id, path, moduleId}, where `path` is the real route the page is served at. Use this to find a page's actual URL before navigating — never guess a route from a filename. The list is read live: a page you just created or edited appears once the backend has registered it again.",
  effect: "read",
  input: z.object({}),
  async run() {
    const pages = Object.values(pagesBySlug).map((page) => ({
      id: page.fullId,
      path: page.fullSlug,
      moduleId: page.module ?? DMS_MODULE_ID,
    }));
    return textResult(
      pages.length === 0
        ? "No pages are currently registered (the backend may still be starting or reloading)."
        : JSON.stringify(pages),
    );
  },
});

const navigateToPage = defineTool({
  name: "navigate_to_page",
  title: "Navigate to page",
  description:
    "Resolves a registered page from its path, moves the open dashboard tab of each browser (the one holding its realtime connection) to it, and answers its dashboard URL and how many browsers moved. A path that is not a registered page route answers the closest known routes instead, so it never sends anyone to a 404. Call list_pages for the real routes; never guess one from a filename.",
  effect: "read",
  input: z.object({ path: z.string() }),
  async run({ path }) {
    const route = normalizeRoute(path);
    const known = Object.keys(pagesBySlug);
    if (known.length > 0 && !known.some((slug) => servesRoute(slug, route))) {
      const suggestions = known.slice(0, SUGGESTION_LIMIT);
      return textResult(
        JSON.stringify({
          ok: false,
          error: { code: "unknown_route", path: route, suggestions },
          message: `${route} is not a registered page route. Closest known routes: ${suggestions.join(", ")}. Call list_pages for the full list and use a real route.`,
        }),
      );
    }
    const origin = (getClientBaseUrl() ?? DEFAULT_CLIENT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    const url = `${origin}${route}`;
    const tabs = sendToLeaderTabs({
      topic: "dms:navigate",
      type: "navigate",
      payload: { path: route },
      ts: Date.now(),
    });
    return textResult(
      JSON.stringify({
        ok: true,
        data: { path: route, url, tabs },
        message:
          tabs > 0
            ? `Moved the dashboard tab of ${tabs} browser(s) to ${url}.`
            : `No dashboard tab is open: open ${url}.`,
      }),
    );
  },
});

export const PAGE_TOOLS = [listPages, navigateToPage];

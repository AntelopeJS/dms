import { listFailures } from "./failures";
import type {
  FailedRequest,
  Interaction,
  PageReport,
  PageVerifyReport,
} from "./report";

/** A path segment that names a route rather than a record: lowercase words and dashes. */
const ROUTE_WORD = /^[a-z][a-z-]*$/;
const PATH_IN_TEXT = /\/[^\s,]*/g;
const WEB_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

/** The details that quote what the page shows, cut where the page's text begins. */
const PAGE_TEXT_DETAILS: readonly RegExp[] = [
  /^not checked: the click opened a menu/,
  /^could not open/,
];

/** A path with every segment that is not a route word, such as a record key, replaced. */
function redactPath(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      segment === "" || ROUTE_WORD.test(segment) ? segment : ":value",
    )
    .join("/");
}

function redactUrl(text: string): string {
  const url = new URL(text);
  return WEB_SCHEMES.has(url.protocol)
    ? `${url.origin}${redactPath(url.pathname)}`
    : url.protocol;
}

function redactDetail(detail: string): string {
  const cut = PAGE_TEXT_DETAILS.map((pattern) => pattern.exec(detail)).find(
    (match) => match !== null,
  );
  return cut ? cut[0] : detail;
}

/**
 * Each control by the noun its check names it with (`link`, `tab`, `column`, `search`, `form`,
 * `button`) and its rank among the checks of its kind, never by the text the page shows.
 */
function redactInteractions(interactions: Interaction[]): Interaction[] {
  const seen = new Map<string, number>();
  return interactions.map((interaction) => {
    const ordinal = (seen.get(interaction.kind) ?? 0) + 1;
    seen.set(interaction.kind, ordinal);
    const [noun] = interaction.target.split(" ", 1);
    return {
      ...interaction,
      target: `${noun} #${ordinal}`,
      detail: redactDetail(interaction.detail),
    };
  });
}

function redactRequest(request: FailedRequest): FailedRequest {
  return { ...request, url: redactUrl(request.url) };
}

function redactPage(page: PageReport): PageReport {
  const redacted: PageReport = {
    ...page,
    interactions: redactInteractions(page.interactions),
    errors: {
      console: page.errors.console,
      failedRequests: page.errors.failedRequests.map(redactRequest),
    },
  };
  const derived = new Set(listFailures(page));
  const own = page.failures.filter((line) => !derived.has(line));
  return {
    ...redacted,
    failures: [...new Set([...own, ...listFailures(redacted)])],
  };
}

/**
 * A `page_verify` report as the AI reads it: each link, tab, column, search, form and button is
 * named by its kind and an ordinal, the menu items and errors a click showed are left out, and the
 * paths of requests and held-back writes keep only their route words. The data state of each
 * block, the render and the permissions stay.
 */
export function redactVerifyReport(report: PageVerifyReport): PageVerifyReport {
  return {
    ...report,
    notes: report.notes.map((note) => note.replace(PATH_IN_TEXT, redactPath)),
    pages: report.pages.map(redactPage),
  };
}

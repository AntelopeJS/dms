import { listFailures } from "./failures";
import type {
  ConsoleError,
  DataBlock,
  FailedRequest,
  Interaction,
  PageReport,
  PageVerifyReport,
} from "./report";

const PATH_IN_TEXT = /\/[^\s,:]*/g;
const UNKNOWN_PATH = "/…";
const URL_BASE = "http://dms.invalid";
const WEB_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);
const ERROR_NAME = /^[A-Z][A-Za-z]*(?:Error|Exception)\b/;
const CONSOLE_ERROR = "console error";

/** The details that quote what the page shows, cut where the page's text begins. */
const PAGE_TEXT_DETAILS: readonly RegExp[] = [
  /^not checked: the click opened a menu/,
  /^could not open/,
];

function pathOf(url: string): string {
  return new URL(url, URL_BASE).pathname;
}

/**
 * A path the report may show: one a block of the page reads, which the Builder or the caller wrote
 * into its options. Any other path can hold a record key, and becomes `/…`.
 */
function redactPath(path: string, known: ReadonlySet<string>): string {
  return known.has(path) ? path : UNKNOWN_PATH;
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

function redactRequest(
  request: FailedRequest,
  known: ReadonlySet<string>,
): FailedRequest {
  const url = new URL(request.url);
  return {
    ...request,
    url: WEB_SCHEMES.has(url.protocol)
      ? `${url.origin}${redactPath(url.pathname, known)}`
      : url.protocol,
  };
}

/** A console error by its error class only: its message can quote what a server answered. */
function redactConsole(error: ConsoleError): ConsoleError {
  return {
    ...error,
    text: ERROR_NAME.exec(error.text)?.[0] ?? CONSOLE_ERROR,
  };
}

function redactSource(block: DataBlock): DataBlock {
  return block.source === undefined
    ? block
    : { ...block, source: pathOf(block.source) };
}

function redactPage(page: PageReport, known: ReadonlySet<string>): PageReport {
  const redacted: PageReport = {
    ...page,
    data: page.data.map(redactSource),
    interactions: redactInteractions(page.interactions),
    errors: {
      console: page.errors.console.map(redactConsole),
      failedRequests: page.errors.failedRequests.map((request) =>
        redactRequest(request, known),
      ),
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
 * named by its kind and an ordinal, the menu items and errors a click showed are left out, a
 * console error keeps only its class, a block's source loses its query, and a request or
 * held-back write shows its path only when a block of the run reads that path. The data state of
 * each block, the render and the permissions stay.
 */
export function redactVerifyReport(report: PageVerifyReport): PageVerifyReport {
  const known = new Set(
    report.pages.flatMap((page) =>
      page.data.flatMap((block) =>
        block.source === undefined ? [] : [pathOf(block.source)],
      ),
    ),
  );
  return {
    ...report,
    notes: report.notes.map((note) =>
      note.replace(PATH_IN_TEXT, (path) => redactPath(path, known)),
    ),
    pages: report.pages.map((page) => redactPage(page, known)),
  };
}

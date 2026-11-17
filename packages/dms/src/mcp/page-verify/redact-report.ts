import { listFailures } from "./failures";
import type {
  ConsoleError,
  DataBlock,
  FailedRequest,
  Interaction,
  PageReport,
  PageVerifyReport,
} from "./report";

const WRITE_NOTE =
  /^(Writes (?:held back|let through) \(submit: (?:true|false)\): )(.*)$/;
const WRITE_SEPARATOR = ", ";
const SOURCE_END = /[?#]/;
const UNKNOWN_PATH = "/…";
const OTHER_ORIGIN = "other origin";
const URL_BASE = "http://dms.invalid";
const WEB_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);
const ERROR_NAME = /^(?:[A-Z][A-Za-z]*)?(?:Error|Exception)\b/;
const CONSOLE_ERROR = "console error";

/** The details that quote what the page shows, cut where the page's text begins. */
const PAGE_TEXT_DETAILS: readonly RegExp[] = [
  /^not checked: the click opened a menu/,
  /^could not open/,
];

/** What the report may show of a run: the paths its blocks read, and the dashboard's origin. */
interface Shown {
  paths: ReadonlySet<string>;
  origin: string;
}

function parsedUrl(text: string, base?: string): URL | undefined {
  try {
    return new URL(text, base);
  } catch {
    return undefined;
  }
}

/**
 * A path the report may show: one a block of the page reads, which the Builder or the caller wrote
 * into its options. Any other path can hold a record key, and becomes `/…`.
 */
function redactPath(path: string, shown: Shown): string {
  return shown.paths.has(path) ? path : UNKNOWN_PATH;
}

/** A `METHOD /path` entry of a writes note, its path shown only when a block reads it. */
function redactWrite(entry: string, shown: Shown): string {
  const [method, path = ""] = entry.split(" ", 2);
  return `${method} ${redactPath(path, shown)}`;
}

/** A writes note with each write redacted; every other note is the run's own wording. */
function redactNote(note: string, shown: Shown): string {
  const match = WRITE_NOTE.exec(note);
  if (!match) return note;
  const writes = match[2]
    .split(WRITE_SEPARATOR)
    .map((entry) => redactWrite(entry, shown));
  return `${match[1]}${writes.join(WRITE_SEPARATOR)}`;
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

/** A request URL: the dashboard's origin and a path a block reads, never another origin. */
function redactRequestUrl(text: string, shown: Shown): string {
  const url = parsedUrl(text);
  if (url === undefined) return OTHER_ORIGIN;
  if (!WEB_SCHEMES.has(url.protocol)) return url.protocol;
  if (url.origin !== shown.origin) return OTHER_ORIGIN;
  return `${url.origin}${redactPath(url.pathname, shown)}`;
}

function redactRequest(request: FailedRequest, shown: Shown): FailedRequest {
  return { ...request, url: redactRequestUrl(request.url, shown) };
}

/** A console error by its error class only: its message can quote what a server answered. */
function redactConsole(error: ConsoleError): ConsoleError {
  return {
    ...error,
    text: ERROR_NAME.exec(error.text)?.[0] ?? CONSOLE_ERROR,
  };
}

/** A block's source without its query or fragment, as its options write it. */
function redactSource(block: DataBlock): DataBlock {
  return block.source === undefined
    ? block
    : { ...block, source: block.source.split(SOURCE_END, 1)[0] };
}

function redactPage(page: PageReport, shown: Shown): PageReport {
  const redacted: PageReport = {
    ...page,
    data: page.data.map(redactSource),
    interactions: redactInteractions(page.interactions),
    errors: {
      console: page.errors.console.map(redactConsole),
      failedRequests: page.errors.failedRequests.map((request) =>
        redactRequest(request, shown),
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

function shownOf(report: PageVerifyReport): Shown {
  const paths = report.pages.flatMap((page) =>
    page.data.flatMap((block) => {
      const url =
        block.source === undefined
          ? undefined
          : parsedUrl(block.source, URL_BASE);
      return url === undefined ? [] : [url.pathname];
    }),
  );
  return {
    paths: new Set(paths),
    origin: parsedUrl(report.dashboardUrl)?.origin ?? OTHER_ORIGIN,
  };
}

/**
 * A `page_verify` report as the AI reads it: each link, tab, column, search, form and button is
 * named by its kind and an ordinal, the menu items and errors a click showed are left out, a
 * console error keeps only its class, a block's source loses its query, a request to another
 * origin shows none, and a request or held-back write shows its path only when a block of the run
 * reads that path. The data state of each block, the render and the permissions stay.
 */
export function redactVerifyReport(report: PageVerifyReport): PageVerifyReport {
  const shown = shownOf(report);
  return {
    ...report,
    notes: report.notes.map((note) => redactNote(note, shown)),
    pages: report.pages.map((page) => redactPage(page, shown)),
  };
}

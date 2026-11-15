import { listFailures } from "./failures";
import type {
  FailedRequest,
  Interaction,
  PageReport,
  PageVerifyReport,
} from "./report";

const QUOTED = /"[^"]*"/g;

/** The text with every name the browser read off the page, always quoted, replaced by an ordinal. */
function withoutNames(text: string, ordinal: number): string {
  return text.replace(QUOTED, `#${ordinal}`);
}

function redactInteractions(interactions: Interaction[]): Interaction[] {
  const seen = new Map<string, number>();
  return interactions.map((interaction) => {
    const ordinal = (seen.get(interaction.kind) ?? 0) + 1;
    seen.set(interaction.kind, ordinal);
    return {
      ...interaction,
      target: withoutNames(interaction.target, ordinal),
      detail: withoutNames(interaction.detail, ordinal),
    };
  });
}

/** A request's URL without its query and fragment, where a filter or a search sends values. */
function redactRequest(request: FailedRequest): FailedRequest {
  const url = new URL(request.url);
  return { ...request, url: `${url.origin}${url.pathname}` };
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
  return { ...redacted, failures: listFailures(redacted) };
}

/**
 * A `page_verify` report as the AI reads it: the names of links, tabs, columns, forms, buttons and
 * menu items read off the rendered page become ordinals, and failed requests lose their query. The
 * data state of each block, the render and the permissions stay.
 */
export function redactVerifyReport(report: PageVerifyReport): PageVerifyReport {
  return { ...report, pages: report.pages.map(redactPage) };
}

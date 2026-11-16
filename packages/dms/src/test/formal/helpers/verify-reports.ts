import fc from "fast-check";
import type {
  ConsoleError,
  DataBlock,
  FailedRequest,
  Interaction,
  InteractionKind,
  PageReport,
  PageVerifyReport,
} from "../../../mcp/page-verify";

const ORIGIN = "http://localhost:5173";
const KINDS: readonly InteractionKind[] = [
  "link",
  "tab",
  "sort",
  "filter",
  "form",
];

/** The shape of what a page shows, around one value of a row, as a browser check quotes it. */
function around(
  canary: fc.Arbitrary<string>,
  ...templates: readonly ((value: string) => string)[]
): fc.Arbitrary<string> {
  return fc
    .tuple(canary, fc.constantFrom(...templates))
    .map(([value, template]) => template(value));
}

/**
 * An arbitrary for a `page_verify` report whose every place that quotes a page, a request or a
 * server answer holds one of `canaries`, as a run over a page of connected rows would have it.
 *
 * @param canaries The values the report must not show once redacted
 */
export function verifyReports(
  canaries: readonly string[],
): fc.Arbitrary<PageVerifyReport> {
  const canary = fc.constantFrom(...canaries);
  const interaction: fc.Arbitrary<Interaction> = fc.record({
    kind: fc.constantFrom(...KINDS),
    target: around(
      canary,
      (value) => `link "${value}" → /customers/${value}`,
      (value) => `tab "${value}"`,
      (value) => `form "Order "${value}"" opened by "${value}"`,
    ),
    ok: fc.boolean(),
    detail: around(
      canary,
      (value) =>
        `not checked: the click opened a menu of "${value}", "${value}"`,
      (value) => `could not open "${value}"`,
      () => "answered 404",
    ),
  });
  const consoleError: fc.Arbitrary<ConsoleError> = fc.record({
    viewport: fc.constant("desktop"),
    text: around(
      canary,
      (value) => `TypeError: no row "${value}"`,
      (value) => `E11000 dup key { email: "${value}" }`,
      (value) => `${value} is archived`,
    ),
  });
  const failedRequest: fc.Arbitrary<FailedRequest> = fc.record({
    viewport: fc.constant("desktop"),
    method: fc.constantFrom("GET", "PUT", "POST"),
    url: around(
      canary,
      (value) => `${ORIGIN}/api/orders/${value}?status=${value}`,
      (value) => `https://${value}.example.com/avatar.png`,
      (value) => `${ORIGIN}/api/customers/${value}#${value}`,
    ),
    status: fc.oneof(
      fc.constant(500),
      fc.constant("net::ERR_NAME_NOT_RESOLVED"),
    ),
  });
  const block: fc.Arbitrary<DataBlock> = fc.record({
    path: fc.constant("page.table"),
    type: fc.constant("TableView"),
    state: fc.constantFrom("ok", "empty", "error"),
    viewport: fc.constant("desktop"),
    source: around(
      canary,
      (value) => `/api/orders?status=${value}`,
      (value) => `/api/orders#${value}`,
    ),
  });
  const page: fc.Arbitrary<PageReport> = fc.record({
    page: fc.constant("/orders"),
    ok: fc.boolean(),
    failures: fc.constant([]),
    render: fc.constant({ viewports: [] }),
    data: fc.array(block, { maxLength: 2 }),
    errors: fc.record({
      console: fc.array(consoleError, { maxLength: 3 }),
      failedRequests: fc.array(failedRequest, { maxLength: 3 }),
    }),
    interactions: fc.array(interaction, { maxLength: 4 }),
    permissions: fc.constant([]),
  });
  return fc.record({
    ok: fc.boolean(),
    dashboardUrl: fc.constant(ORIGIN),
    account: fc.constant({
      kind: "owner" as const,
      email: "owner@example.test",
    }),
    notes: fc.array(
      around(
        canary,
        (value) =>
          `Writes held back (submit: false): PUT /api/items/${value}, POST /api/customers/${value},${value}`,
      ),
      { maxLength: 2 },
    ),
    pages: fc.array(page, { minLength: 1, maxLength: 2 }),
  });
}

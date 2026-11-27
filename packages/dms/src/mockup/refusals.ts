import { HTTPResult } from "@antelopejs/interface-api";

const HTTP_NOT_FOUND = 404;

/** What a mockup route can fail to find, each with the translation key its 404 answers. */
const NOT_FOUND_KEYS = {
  mockup: "$dms.refusals.mockup.not_found",
  version: "$dms.refusals.mockup.version_not_found",
  page: "$dms.refusals.mockup.page_not_found",
  fixture: "$dms.refusals.mockup.fixture_not_found",
  rows: "$dms.refusals.mockup.rows_not_found",
  example: "$dms.refusals.mockup.example_not_found",
  annotation: "$dms.refusals.mockup.annotation_not_found",
  node: "$dms.refusals.mockup.node_not_found",
  pageNode: "$dms.refusals.mockup.page_node_not_found",
  row: "$dms.refusals.mockup.row_not_found",
  route: "$dms.refusals.mockup.route_not_found",
  lock: "$dms.refusals.mockup.lock_not_found",
} as const;

/** What a mockup route failed to find. */
export type MockupSubject = keyof typeof NOT_FOUND_KEYS;

/** The 404 of a mockup route, its message the translation key of what was not found. */
export function notFound(what: MockupSubject): HTTPResult {
  return new HTTPResult(HTTP_NOT_FOUND, { message: NOT_FOUND_KEYS[what] });
}

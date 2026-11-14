import { describe, expect, it } from "vitest";
import { parseMockupSummary } from "../layers/dms-ui/app/entries/utils/mockup";
import routes from "./fixtures/relative-routes.json";

function builtSummary(path: string) {
  return {
    name: "bike-rental",
    pages: 1,
    openComments: 0,
    updatedAt: "2026-11-13T10:00:00.000Z",
    status: "built",
    builtAt: "2026-11-13T10:00:00.000Z",
    builtPages: [{ path, title: "Bikes" }],
  };
}

/**
 * Reads the table the backend's `RELATIVE_ROUTE_PATTERN` tests read. Fails an
 * implementation that keeps the old `\S*` rule, which accepts a control
 * character such as `\u0000` or `\u007f`, or that refuses a path the backend
 * writes.
 */
describe("a built page's path", () => {
  it.each(routes.accepted)("accepts %j", (path) => {
    expect(parseMockupSummary(builtSummary(path))).toBeDefined();
  });

  it.each(routes.refused)("refuses %j", (path) => {
    expect(parseMockupSummary(builtSummary(path))).toBeUndefined();
  });
});

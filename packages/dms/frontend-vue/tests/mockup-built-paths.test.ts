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
    builtPages: [{ path, title: "Bikes", changed: false }],
  };
}

describe("a built page's path, read from the table the backend's RELATIVE_ROUTE_PATTERN tests read", () => {
  it.each(routes.accepted)(
    "accepts %j, so a path the backend writes is not refused",
    (path) => {
      expect(parseMockupSummary(builtSummary(path))).toBeDefined();
    },
  );

  it.each(routes.refused)(
    "refuses %j (fails on the old \\S* rule, which accepts a control character such as \\u0000 or \\u007f)",
    (path) => {
      expect(parseMockupSummary(builtSummary(path))).toBeUndefined();
    },
  );
});

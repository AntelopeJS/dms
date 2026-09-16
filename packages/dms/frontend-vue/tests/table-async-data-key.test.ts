import { describe, expect, it } from "vitest";
import { buildTableDataKey } from "../layers/dms-ui/app/build/composables/table-view/utils/tableQuery";

const baseRequest = {
  componentId: "runs",
  pageId: "automation.runs",
  query: { offset: 0, limit: 10 },
  archiveQuery: {},
  isSelfManaged: false,
};

describe("TableView async-data key", () => {
  it("refetches when a client preference changes the hydrated SSR query", () => {
    const serverKey = buildTableDataKey(baseRequest);
    const clientKey = buildTableDataKey({
      ...baseRequest,
      query: { ...baseRequest.query, filter_status: "is:failed" },
    });
    const hydratedData = new Map([[serverKey, ["success", "failed"]]]);

    expect(clientKey).not.toBe(serverKey);
    expect(hydratedData.has(clientKey)).toBe(false);
  });

  it("reuses hydration when the client and server requests match", () => {
    const serverKey = buildTableDataKey(baseRequest);
    const hydratedData = new Map([[serverKey, ["success", "failed"]]]);
    const clientKey = buildTableDataKey({ ...baseRequest });

    expect(clientKey).toBe(serverKey);
    expect(hydratedData.get(clientKey)).toEqual(["success", "failed"]);
  });
});

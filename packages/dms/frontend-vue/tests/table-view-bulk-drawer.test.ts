/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import {
  bulkSelectionQuery,
  isAllMatchingAction,
  targetWithSelection,
  withQuery,
} from "../layers/dms-ui/app/entries/composables/actions/bulkSelection";
import {
  listenRowSteps,
  trackRowNavigation,
} from "../layers/dms-ui/app/entries/composables/actions/rowNavigation";
import {
  deepLinkOutcome,
  readRecordId,
  recordUrlKey,
  writeRecordId,
} from "../layers/dms-ui/app/entries/composables/table-view/utils/recordLink";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";
import type { RowNavigation } from "../layers/dms-ui/app/types/row-navigation";

describe("bulk selection requests", () => {
  it("sends the ids, or the filters of every matching row", () => {
    expect(bulkSelectionQuery({ ids: ["a", "b"], count: 2 })).toEqual({
      ids: ["a", "b"],
    });
    expect(
      bulkSelectionQuery({
        matching: { filter_status: "is:open", search: "", showArchived: false },
        count: 40,
      }),
    ).toEqual({
      allMatching: "true",
      filter_status: "is:open",
      showArchived: "false",
    });
  });

  it("appends the selection to a URL target, a repeated key per id", () => {
    expect(withQuery("/api/runs/rerun?force=1", { ids: ["a", "b"] })).toBe(
      "/api/runs/rerun?force=1&ids=a&ids=b",
    );
    expect(
      targetWithSelection(
        { type: "api", url: "/rerun", successMessage: "ok" },
        { ids: ["a"] },
      ),
    ).toEqual({ type: "api", url: "/rerun?ids=a", successMessage: "ok" });
    const drawer = {
      type: "drawer" as const,
      component: { componentName: "RunDrawer" },
    };
    expect(targetWithSelection(drawer, { ids: ["a"] })).toBe(drawer);
  });

  it("keeps a URL's own query as written, its tokens still to fill", () => {
    expect(
      withQuery("/api/runs/rerun?site={{query.site}}", { ids: ["a"] }),
    ).toBe("/api/runs/rerun?site={{query.site}}&ids=a");
    expect(withQuery("/rerun?", { ids: ["a"] })).toBe("/rerun?ids=a");
    expect(withQuery("/rerun#top", { ids: ["a"] })).toBe("/rerun?ids=a#top");
    expect(withQuery("/rerun?x=1", {})).toBe("/rerun?x=1");
  });

  it("takes a row token out of a URL the selection bar sends, as an unresolved page token", () => {
    expect(
      targetWithSelection(
        { type: "api", url: "/rerun?ids={{row._id}}&force=1" },
        { ids: ["a", "b"] },
      ),
    ).toEqual({ type: "api", url: "/rerun?force=1&ids=a&ids=b" });
    expect(
      targetWithSelection(
        { type: "download", url: "/export?ids={{ row._id }}" },
        { ids: ["a"] },
      ),
    ).toEqual({ type: "download", url: "/export?ids=a" });
    expect(
      targetWithSelection(
        { type: "page", url: "/runs/{{row._id}}/compare?mode=x" },
        { ids: ["a"] },
      ),
    ).toEqual({ type: "page", url: "/runs//compare?mode=x&ids=a" });
  });

  it("tells actions reaching every matching row", () => {
    const target = { type: "page" as const, url: "/x" };
    expect(isAllMatchingAction({ label: "a", target, bulk: true })).toBe(false);
    expect(
      isAllMatchingAction({ label: "a", target, bulk: { allMatching: true } }),
    ).toBe(true);
  });
});

describe("row navigation", () => {
  const rows = [{ _id: "r1" }, { _id: "r2" }, { _id: "r3" }];
  const source = { rows: () => rows, rowIdKey: "_id" };

  it("places a row among the rows shown and steps to its neighbours", () => {
    const opened: unknown[] = [];
    let navigation: RowNavigation | undefined;
    const stop = trackRowNavigation(
      source,
      rows[1]!,
      (row) => opened.push(row),
      (next) => {
        navigation = next;
      },
    );
    expect(navigation).toMatchObject({
      index: 1,
      total: 3,
      hasPrev: true,
      hasNext: true,
    });
    navigation!.next();
    navigation!.prev();
    expect(opened).toEqual([rows[2], rows[0]]);
    stop();
    trackRowNavigation(
      source,
      { _id: "gone" },
      () => {},
      (next) => {
        navigation = next;
      },
    )();
    expect(navigation).toBe(undefined);
  });

  it("steps with J and K, never while the user types", () => {
    const next = vi.fn();
    const prev = vi.fn();
    const stop = listenRowSteps(() => ({
      index: 0,
      total: 2,
      hasPrev: false,
      hasNext: true,
      next,
      prev,
    }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "K" }));
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", bubbles: true }),
    );
    input.remove();
    stop();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(prev).toHaveBeenCalledTimes(1);
  });
});

describe("record deep links", () => {
  it("keys the open row by table on a page with several tables", () => {
    expect(recordUrlKey({ tableId: "runs", isSoleTableView: true })).toBe(
      "record",
    );
    expect(recordUrlKey({ tableId: "runs", isSoleTableView: false })).toBe(
      "runs.record",
    );
    expect(readRecordId({ "runs.record": "r2" }, { tableId: "runs" })).toBe(
      "r2",
    );
    expect(readRecordId({ record: "r2" }, { tableId: "runs" })).toBe(undefined);
  });

  it("writes and removes the open row in the URL in place", () => {
    window.history.replaceState(null, "", "/runs?tab=open");
    writeRecordId({ tableId: "runs", isSoleTableView: true }, "r7");
    expect(window.location.search).toBe("?tab=open&record=r7");
    writeRecordId({ tableId: "runs", isSoleTableView: true });
    expect(window.location.search).toBe("?tab=open");
  });

  it("notifies a link no row answers, unless a side panel shows it missing", () => {
    const panel: CustomRowAction = {
      label: "Panel",
      target: { type: "sidePanel", component: { componentName: "RunPanel" } },
    };
    const drawer: CustomRowAction = {
      label: "Drawer",
      target: { type: "drawer", component: { componentName: "RunDrawer" } },
      deepLink: true,
    };
    const row = { id: "r1" };
    expect(deepLinkOutcome({ row, isMissing: false }, drawer)).toBe("open");
    expect(deepLinkOutcome({ isMissing: true }, panel)).toBe("missingPanel");
    expect(deepLinkOutcome({ isMissing: true }, drawer)).toBe("notify");
    expect(deepLinkOutcome({ isMissing: false }, panel)).toBe("notify");
    expect(deepLinkOutcome({ isMissing: false }, drawer)).toBe("notify");
    expect(deepLinkOutcome({ isMissing: false, isFailed: true }, panel)).toBe(
      "notifyFailed",
    );
    expect(deepLinkOutcome({ isMissing: false, isFailed: true }, drawer)).toBe(
      "notifyFailed",
    );
  });
});

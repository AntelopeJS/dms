// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import {
  bulkSelectionQuery,
  isAllMatchingAction,
  targetWithSelection,
  withQuery,
} from "../layers/dms-ui/app/build/composables/actions/bulkSelection";
import {
  listenRowSteps,
  rowNavigation,
} from "../layers/dms-ui/app/build/composables/actions/rowNavigation";
import {
  readRecordId,
  recordUrlKey,
  writeRecordId,
} from "../layers/dms-ui/app/build/composables/table-view/utils/recordLink";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

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
    const navigation = rowNavigation(source, rows[1]!, (row) =>
      opened.push(row),
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
    expect(rowNavigation(source, { _id: "gone" }, () => {})).toBe(undefined);
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
});

describe("action targets on a selection and on a listed row", () => {
  let app: App | undefined;
  const api = vi.fn(async () => ({}));
  const toasts: Array<{ title?: string }> = [];
  const drawers: Array<{
    options: Record<string, unknown>;
    patches: Array<Record<string, unknown>>;
    settle: () => void;
  }> = [];

  const mountTargets = (config: Record<string, unknown> = {}) => {
    let targets: ReturnType<typeof useActionTargets> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          targets = useActionTargets({
            api: api as never,
            pageId: "runs-page",
            componentId: "runs",
            handleApiError: vi.fn(),
            ...config,
          });
          return () => h("div");
        },
      }),
    );
    app.mount(document.createElement("div"));
    return targets!;
  };

  beforeEach(() => {
    api.mockClear();
    toasts.length = 0;
    drawers.length = 0;
    vi.stubGlobal("Color", { success: "success" });
    vi.stubGlobal("HttpMethod", { post: "POST" });
    vi.stubGlobal("useToast", () => ({
      add: (toast: never) => toasts.push(toast),
    }));
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (text: string) => text,
      processApiMessage: (text: string) => text,
    }));
    vi.stubGlobal("useI18n", () => ({
      t: (key: string, params: Record<string, unknown>, plural?: number) =>
        `${key}(${String(params.count)}|${String(plural)})`,
    }));
    vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
    vi.stubGlobal("useDrawer", () => ({
      open: (options: Record<string, unknown>) => {
        let settle!: () => void;
        const result = new Promise<void>((resolve) => {
          settle = resolve;
        });
        const drawer = {
          options,
          patches: [] as Array<Record<string, unknown>>,
          settle,
        };
        drawers.push(drawer);
        return {
          result,
          close: () => settle(),
          patch: (patch: Record<string, unknown>) => drawer.patches.push(patch),
        };
      },
    }));
    vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
    vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn(async () => true) }));
    vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
    vi.stubGlobal("interpolateUrl", (url: string) => url);
    vi.stubGlobal("resolveDmsComponent", () =>
      defineComponent({ render: () => null }),
    );
    vi.stubGlobal("markRaw", <T>(value: T) => value);
    vi.stubGlobal("ref", ref);
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("calls an api bulk action with the selection, its toast counting the rows", async () => {
    const targets = mountTargets();
    const action: CustomRowAction = {
      label: "Re-run",
      bulk: { allMatching: true },
      target: {
        type: "api",
        url: "/api/runs/rerun",
        successMessage: "$runs.done",
      },
    };
    targets.handleBulkCustomAction(action, { ids: ["a", "b"], count: 2 });
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith("/api/runs/rerun?ids=a&ids=b", {
      method: "POST",
    });
    await vi.waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]?.title).toBe("runs.done(2|2)");

    targets.handleBulkCustomAction(action, {
      matching: { filter_status: "is:open" },
      count: 40,
    });
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api.mock.calls[1]?.[0]).toBe(
      "/api/runs/rerun?allMatching=true&filter_status=is%3Aopen",
    );
  });

  it("steps a row's drawer through the rows shown and keeps it in the URL", async () => {
    window.history.replaceState(null, "", "/runs");
    const rows = [{ _id: "r1" }, { _id: "r2" }];
    const targets = mountTargets({
      rowNavigation: { rows: () => rows, rowIdKey: "_id" },
      recordScope: { tableId: "runs", isSoleTableView: true },
    });
    targets.handleCustomRowAction(
      {
        label: "Details",
        deepLink: true,
        target: { type: "drawer", component: { componentName: "RunDrawer" } },
      },
      rows[0],
    );
    await vi.waitFor(() => expect(drawers).toHaveLength(1));
    const [drawer] = drawers;
    const options = drawer!.options.componentOptions as Record<string, unknown>;
    expect(options.rowData).toBe(rows[0]);
    expect(options.navigation).toMatchObject({
      index: 0,
      total: 2,
      hasNext: true,
    });
    expect(window.location.search).toBe("?record=r1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(drawer!.patches).toHaveLength(1);
    expect(drawer!.patches[0]).toMatchObject({ componentKey: "r2" });
    expect(
      (drawer!.patches[0]!.componentOptions as Record<string, unknown>).rowData,
    ).toBe(rows[1]);
    expect(window.location.search).toBe("?record=r2");

    drawer!.settle();
    await nextTick();
    await Promise.resolve();
    expect(window.location.search).toBe("");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    expect(drawer!.patches).toHaveLength(1);
  });

  it("hands a bulk drawer the selection instead of a row", async () => {
    const targets = mountTargets();
    targets.handleBulkCustomAction(
      {
        label: "Assign",
        bulk: true,
        target: {
          type: "drawer",
          component: { componentName: "AssignDrawer" },
        },
      },
      { ids: ["a"], count: 1 },
    );
    await vi.waitFor(() => expect(drawers).toHaveLength(1));
    const options = drawers[0]!.options.componentOptions as Record<
      string,
      unknown
    >;
    expect(options.rowData).toBe(undefined);
    expect(options.selection).toEqual({ ids: ["a"], count: 1 });
  });
});

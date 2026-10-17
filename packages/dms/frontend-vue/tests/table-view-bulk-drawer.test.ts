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
  deepLinkOutcome,
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

  it("notifies a link no row answers, unless a side panel shows it missing", () => {
    const panel = {
      target: { type: "sidePanel" },
    } as unknown as CustomRowAction;
    const drawer = {
      target: { type: "drawer" },
      deepLink: true,
    } as unknown as CustomRowAction;
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
    const onRecordShown = vi.fn();
    const targets = mountTargets({
      rowNavigation: { rows: () => rows, rowIdKey: "_id" },
      recordScope: { tableId: "runs", isSoleTableView: true },
      onRecordShown,
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
    expect(onRecordShown.mock.calls).toEqual([["r1"], ["r2"], [undefined]]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    expect(drawer!.patches).toHaveLength(1);
  });

  it("shows another row in a row's drawer by id, read when unlisted", async () => {
    window.history.replaceState(null, "", "/runs");
    const rows = [{ _id: "r1" }, { _id: "r2" }];
    const older = { _id: "r9" };
    const getRow = vi.fn(async (id: string) =>
      id === "r9" ? older : undefined,
    );
    const targets = mountTargets({
      rowNavigation: { rows: () => rows, rowIdKey: "_id", getRow },
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
    const showRow = options.showRow as (row: object | string) => Promise<void>;

    await showRow("r9");
    expect(drawer!.patches[0]).toMatchObject({ componentKey: "r9" });
    const patched = drawer!.patches[0]!.componentOptions as Record<
      string,
      unknown
    >;
    expect(patched.rowData).toBe(older);
    expect(patched.navigation).toBeUndefined();
    expect(window.location.search).toBe("?record=r9");

    await showRow("r2");
    expect(getRow).toHaveBeenCalledTimes(1);
    expect(drawer!.patches[1]).toMatchObject({ componentKey: "r2" });
    expect(window.location.search).toBe("?record=r2");

    await expect(showRow("r404")).rejects.toThrow("r404");
    expect(drawer!.patches).toHaveLength(2);
    drawer!.settle();
  });

  const deferredRows = () => {
    const pending = new Map<string, (row: object) => void>();
    const getRow = vi.fn(
      (id: string) =>
        new Promise<object | undefined>((resolve) => pending.set(id, resolve)),
    );
    return { getRow, resolve: (id: string) => pending.get(id)!({ _id: id }) };
  };

  const openDeepLinkedDrawer = (getRow: (id: string) => Promise<unknown>) => {
    window.history.replaceState(null, "", "/runs");
    const rows = [{ _id: "r1" }];
    const targets = mountTargets({
      rowNavigation: { rows: () => rows, rowIdKey: "_id", getRow },
      recordScope: { tableId: "runs", isSoleTableView: true },
      onRecordShown: vi.fn(),
    });
    targets.handleCustomRowAction(
      {
        label: "Details",
        deepLink: true,
        target: { type: "drawer", component: { componentName: "RunDrawer" } },
      },
      rows[0],
    );
    return targets;
  };

  const showRowOf = (drawer: (typeof drawers)[number]) =>
    (drawer.options.componentOptions as Record<string, unknown>).showRow as (
      row: object | string,
    ) => Promise<void>;

  it("drops a row read that resolves after its drawer closed", async () => {
    const rows = deferredRows();
    openDeepLinkedDrawer(rows.getRow);
    await vi.waitFor(() => expect(drawers).toHaveLength(1));
    const [drawer] = drawers;
    const shown = showRowOf(drawer!)("r9");

    drawer!.settle();
    await vi.waitFor(() => expect(window.location.search).toBe(""));
    rows.resolve("r9");
    await shown;

    expect(window.location.search).toBe("");
    expect(drawer!.patches).toHaveLength(0);
    expect(drawers).toHaveLength(1);
  });

  it("applies only the latest of two rows read at once", async () => {
    const rows = deferredRows();
    openDeepLinkedDrawer(rows.getRow);
    await vi.waitFor(() => expect(drawers).toHaveLength(1));
    const [drawer] = drawers;
    const showRow = showRowOf(drawer!);
    const first = showRow("r8");
    const second = showRow("r9");

    rows.resolve("r9");
    await second;
    rows.resolve("r8");
    await first;

    expect(drawer!.patches).toHaveLength(1);
    expect(drawer!.patches[0]).toMatchObject({ componentKey: "r9" });
    expect(window.location.search).toBe("?record=r9");
    drawer!.settle();
  });

  it("names the open row in a drawer's {{query.record}} options", async () => {
    window.history.replaceState(null, "", "/quotes");
    const rows = [{ _id: "q1" }, { _id: "q2" }];
    const targets = mountTargets({
      rowNavigation: { rows: () => rows, rowIdKey: "_id" },
      recordScope: { tableId: "quotes", isSoleTableView: true },
    });
    targets.handleCustomRowAction(
      {
        label: "Open",
        deepLink: true,
        target: {
          type: "drawer",
          component: {
            componentName: "QuoteForm",
            options: {
              rowId: "{{query.record}}",
              fetchUrl: "/api/quotes/get?id={{query.record}}",
            },
          },
        },
      },
      rows[0],
    );
    await vi.waitFor(() => expect(drawers).toHaveLength(1));
    const [drawer] = drawers;
    expect(drawer!.options.componentOptions).toMatchObject({
      rowId: "q1",
      fetchUrl: "/api/quotes/get?id=q1",
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(drawer!.patches[0]!.componentOptions).toMatchObject({
      rowId: "q2",
      fetchUrl: "/api/quotes/get?id=q2",
    });
    drawer!.settle();
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

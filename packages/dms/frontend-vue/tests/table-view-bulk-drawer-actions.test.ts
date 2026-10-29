/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import type { ConfirmOptions } from "../layers/dms-ui/app/composables/confirm/types";
import {
  drawerBody,
  api,
  toasts,
  drawers,
  mountTargets,
} from "./table-view-bulk-drawer-runtime";

describe("a bulk action run on one row", () => {
  const bulkApi = (url: string): CustomRowAction => ({
    label: "Re-run",
    bulk: true,
    target: { type: "api", url },
  });

  beforeEach(() => vi.stubGlobal("interpolateUrl", interpolateUrl));

  it("sends that row's id as the selection bar sends the selection's", async () => {
    const targets = mountTargets();
    targets.handleCustomRowAction(bulkApi("/api/runs/rerun"), { _id: "r 1" });
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0]?.[0]).toBe("/api/runs/rerun?ids=r+1");
  });

  it("reads the id through the table's rowIdKey", async () => {
    const targets = mountTargets({ rowIdKey: "code" });
    targets.handleCustomRowAction(bulkApi("/api/runs/rerun?force=1"), {
      _id: "x",
      code: "R-7",
    });
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0]?.[0]).toBe("/api/runs/rerun?force=1&ids=R-7");
  });

  it("fills a URL naming the row itself rather than adding ids, and the bar drops it", async () => {
    const targets = mountTargets();
    const action = bulkApi("/api/runs/rerun?ids={{row._id}}");
    targets.handleCustomRowAction(action, { _id: "r1" });
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0]?.[0]).toBe("/api/runs/rerun?ids=r1");

    targets.handleBulkCustomAction(action, { ids: ["a", "b"], count: 2 });
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api.mock.calls[1]?.[0]).toBe("/api/runs/rerun?ids=a&ids=b");
  });

  it("counts one row in its confirmation and its success toast", async () => {
    const confirm = vi.fn(
      async (options: Pick<ConfirmOptions, "onConfirm">) => {
        await options.onConfirm?.({});
        return true;
      },
    );
    vi.stubGlobal("useConfirm", () => ({ confirm }));
    const targets = mountTargets();
    targets.handleCustomRowAction(
      {
        label: "Resolve",
        bulk: true,
        confirm: { title: "$tickets.resolve_confirm" },
        target: {
          type: "api",
          url: "/api/tickets/bulk/resolve",
          successMessage: "$tickets.resolved",
        },
      },
      { _id: "t7", subject: "Noisy fan" },
    );
    await vi.waitFor(() => expect(toasts).toHaveLength(1));
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: "tickets.resolve_confirm(1|1)",
    });
    expect(toasts[0]?.title).toBe("tickets.resolved(1|1)");
    expect(api.mock.calls[0]?.[0]).toBe("/api/tickets/bulk/resolve?ids=t7");
  });

  it("leaves an action that is not bulk as it is", async () => {
    const targets = mountTargets();
    targets.handleCustomRowAction(
      { label: "Run", target: { type: "api", url: "/api/runs/run" } },
      { _id: "r1" },
    );
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0]?.[0]).toBe("/api/runs/run");
  });

  it("hands a drawer its row and the selection of that row", () => {
    const targets = mountTargets();
    targets.handleCustomRowAction(
      {
        label: "Inspect",
        bulk: true,
        target: { type: "drawer", component: { componentName: "RunDrawer" } },
      },
      { _id: "r1" },
    );
    const options = drawerBody(drawers[0]?.options.componentOptions);
    expect(options.rowData).toEqual({ _id: "r1" });
    expect(options.selection).toEqual({ ids: ["r1"], count: 1 });
  });
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

it("counts the rows a bulk route says it changed, not the selection", async () => {
  vi.stubGlobal("useConfirm", () => ({
    confirm: vi.fn(async (options: Pick<ConfirmOptions, "onConfirm">) => {
      await options.onConfirm?.({});
      return true;
    }),
  }));
  const targets = mountTargets();
  const action: CustomRowAction = {
    label: "Resolve",
    bulk: true,
    target: {
      type: "api",
      url: "/api/tickets/resolve",
      successMessage: "$tickets.resolved",
    },
  };
  const selection = { ids: ["a", "b", "c"], count: 3 };
  api.mockResolvedValueOnce({ count: 2 });
  targets.handleBulkCustomAction(action, selection);
  await vi.waitFor(() => expect(toasts).toHaveLength(1));
  expect(toasts[0]?.title).toBe("tickets.resolved(2|2)");

  api.mockResolvedValueOnce({ count: 0 });
  targets.handleBulkCustomAction(action, selection);
  await vi.waitFor(() => expect(toasts).toHaveLength(2));
  expect(toasts[1]?.title).toBe("tickets.resolved(0|0)");

  api.mockResolvedValueOnce(1);
  targets.handleBulkCustomAction(
    { ...action, confirm: { title: "Resolve?" } },
    selection,
  );
  await vi.waitFor(() => expect(toasts).toHaveLength(3));
  expect(toasts[2]?.title).toBe("tickets.resolved(1|1)");
});

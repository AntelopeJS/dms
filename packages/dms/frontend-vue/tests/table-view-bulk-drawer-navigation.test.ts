/** @vitest-environment jsdom */
import { nextTick } from "vue";
import { expect, it, vi } from "vitest";
import TargetComponentTree from "../layers/dms-ui/app/build/components/containers/TargetComponentTree.vue";
import type { RowNavigationSource } from "../layers/dms-ui/app/build/composables/actions/rowNavigation";
import {
  drawerBody,
  drawers,
  mountTargets,
} from "./table-view-bulk-drawer-runtime";

it("fills a row drawer's component options with each row it steps to", () => {
  const rows = [{ _id: "r1" }, { _id: "r2" }];
  const targets = mountTargets({
    rowNavigation: { rows: () => rows, rowIdKey: "_id" },
  });
  targets.handleCustomRowAction(
    {
      label: "Details",
      target: {
        type: "drawer",
        component: {
          componentName: "dms-form",
          options: {
            fetchUrl: "/api/runs/get?id={{row._id}}",
            submitUrl: "/api/runs/edit?id={{row.id}}",
            rowActions: {
              custom: [{ target: { type: "page", url: "/s/{{row._id}}" } }],
            },
            fetchRowUrl: "/api/steps/{{row.id}}",
          },
        },
      },
    },
    rows[0],
  );
  const opened = drawerBody(drawers[0]?.options.componentOptions);
  expect(opened.fetchUrl).toBe("/api/runs/get?id=r1");
  expect(opened.submitUrl).toBe("/api/runs/edit?id=r1");
  expect(opened.rowActions).toEqual({
    custom: [{ target: { type: "page", url: "/s/{{row._id}}" } }],
  });
  expect(opened.fetchRowUrl).toBe("/api/steps/{{row.id}}");
  opened.navigation!.next();
  const patched = drawerBody(drawers[0]?.patches[0]?.componentOptions);
  expect(patched.fetchUrl).toBe("/api/runs/get?id=r2");
  expect(patched.submitUrl).toBe("/api/runs/edit?id=r2");
});

it("hands a bulk drawer its options as declared, with no row to fill them", () => {
  const targets = mountTargets();
  targets.handleBulkCustomAction(
    {
      label: "Inspect",
      bulk: true,
      target: {
        type: "drawer",
        component: {
          componentName: "RunDrawer",
          options: { fetchUrl: "/api/runs/get?id={{row._id}}" },
        },
      },
    },
    { ids: ["a"], count: 1 },
  );
  const opened = drawerBody(drawers[0]?.options.componentOptions);
  expect(opened.fetchUrl).toBe("/api/runs/get?id={{row._id}}");
});

const cardTarget = {
  type: "drawer" as const,
  component: {
    componentName: "Card",
    options: { title: "{{row.name}}" },
    children: [
      {
        id: "facts",
        component: {
          componentName: "KeyValueList",
          options: { fetchUrl: "/x/{{row._id}}" },
        },
      },
    ],
  },
};

it("draws a container drawer with its children, filled with each row", () => {
  const rows = [
    { _id: "r1", name: "First" },
    { _id: "r2", name: "Second" },
  ];
  const targets = mountTargets({
    rowNavigation: { rows: () => rows, rowIdKey: "_id" },
  });
  targets.handleCustomRowAction(
    { label: "Facts", target: cardTarget },
    rows[0],
  );
  expect(drawers[0]?.options.component).toBe(TargetComponentTree);
  const opened = drawerBody(drawers[0]?.options.componentOptions);
  expect(opened.title).toBe("First");
  expect(opened.targetTree!.componentName).toBe("Card");
  expect(opened.targetTree!.children).toMatchObject([
    { id: "facts", options: { fetchUrl: "/x/r1" } },
  ]);
  opened.navigation!.next();
  const patched = drawerBody(drawers[0]?.patches[0]?.componentOptions);
  expect(patched.title).toBe("Second");
  expect(patched.targetTree!.children).toMatchObject([
    { id: "facts", options: { fetchUrl: "/x/r2" } },
  ]);
});

it("hands a bulk container drawer its children as declared", () => {
  const targets = mountTargets();
  targets.handleBulkCustomAction(
    { label: "Facts", bulk: true, target: cardTarget },
    { ids: ["a"], count: 1 },
  );
  const opened = drawerBody(drawers[0]?.options.componentOptions);
  expect(opened.targetTree!.children).toMatchObject([
    { id: "facts", options: { fetchUrl: "/x/{{row._id}}" } },
  ]);
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
  const options = drawerBody(drawer!.options.componentOptions);
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
  expect(drawerBody(drawer!.patches[0]!.componentOptions).rowData).toBe(
    rows[1],
  );
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
  const getRow = vi.fn(async (id: string) => (id === "r9" ? older : undefined));
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
  const options = drawerBody(drawer!.options.componentOptions);
  const showRow = options.showRow!;

  await showRow("r9");
  expect(drawer!.patches[0]).toMatchObject({ componentKey: "r9" });
  const patched = drawerBody(drawer!.patches[0]!.componentOptions);
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
  const pending = new Map<string, (row: { _id: string }) => void>();
  const getRow = vi.fn(
    (id: string) =>
      new Promise<{ _id: string } | undefined>((resolve) =>
        pending.set(id, resolve),
      ),
  );
  return { getRow, resolve: (id: string) => pending.get(id)!({ _id: id }) };
};

const openDeepLinkedDrawer = (
  getRow: NonNullable<RowNavigationSource["getRow"]>,
) => {
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
  drawerBody(drawer.options.componentOptions).showRow!;

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
  const options = drawerBody(drawers[0]!.options.componentOptions);
  expect(options.rowData).toBe(undefined);
  expect(options.selection).toEqual({ ids: ["a"], count: 1 });
});

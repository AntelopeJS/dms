// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, type FunctionalComponent } from "vue";
import Sortable from "sortablejs";
import { TableDragEvent } from "./helpers/table-drag-event";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";
import {
  startTableRealtime,
  stopTableRealtime,
  publishTableEvent,
} from "./helpers/table-runtime";
import { usePageLiveRefresh } from "../layers/dms-ui/app/composables/live/usePageLiveRefresh";
import { usePreferences } from "../layers/dms-core/app/composables/user/usePreferences";
import { CONTENT_LANGUAGE_HEADER } from "../layers/dms-core/app/composables/auth/useAuthFetch";
import type {
  TableViewConfig,
  TableViewDisplayContext,
} from "../layers/dms-ui/app/composables/table-view/types";

const apps: Array<{ unmount: () => void }> = [];
const requests: string[] = [];
const countIds: string[][] = [];
let rejectMove = false;
let stage = "lead";
let holdList = false;
let releaseList = () => {};

beforeEach(async () => {
  requests.length = 0;
  countIds.length = 0;
  stage = "lead";
  rejectMove = false;
  holdList = false;
  await tableViewRuntime(
    async (
      url: string,
      options?: {
        query?: Record<string, unknown>;
        body?: { queries: Array<{ id: string }> };
      },
    ) => {
      requests.push(url);
      if (holdList && url === "/api/orders/list") {
        return new Promise((resolve) => {
          releaseList = () => resolve({ results: [], total: 0 });
        });
      }
      if (url.endsWith("/edit")) {
        if (rejectMove) throw new Error("Move refused");
        stage = "lost";
        return {};
      }
      if (url.endsWith("/delete")) return 1;
      if (url.endsWith("/summary")) return { sum: stage === "lead" ? 1 : 2 };
      if (url.endsWith("/count/batch")) {
        const ids = options?.body?.queries.map(({ id }) => id) ?? [];
        countIds.push(ids);
        return Object.fromEntries(
          ids.map((id) => [id, stage === "lead" ? 1 : 2]),
        );
      }
      if (url.endsWith("/get")) return { _id: "r1", name: "Order", stage };
      const filter = options?.query?.filter_stage;
      const results =
        !filter || filter === `is:${stage}`
          ? [{ _id: "r1", name: "Order", stage }]
          : [];
      return { results, total: results.length, offset: 0, limit: 10 };
    },
  );
  usePreferences().removePreference("tables");
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", CONTENT_LANGUAGE_HEADER);
  await startTableRealtime();
});

afterEach(async () => {
  apps.splice(0).forEach((app) => app.unmount());
  await stopTableRealtime();
  vi.unstubAllGlobals();
});

const boardConfig: Partial<TableViewConfig> = {
  columns: [
    {
      id: "stage",
      accessorKey: "stage",
      header: "Stage",
      listable: true,
      type: {
        id: "select",
        compareModes: ["is"],
        filterComponents: {},
        inputComponent: {
          componentName: "Select",
          options: {
            items: [
              { value: "lead", label: "Lead" },
              { value: "lost", label: "Lost" },
            ],
          },
        },
      },
    },
  ],
  rowActions: { edit: true },
  tabs: [
    { id: "open", label: "Open" },
    { id: "linked", label: "Linked", to: "/linked", countFrom: "/api/linked" },
  ],
  footer: { summary: [{ id: "sum", op: "sum", field: "stage", label: "Sum" }] },
  displays: [
    { id: "table" },
    {
      id: "kanban",
      capabilities: { tabs: true },
      options: { groupByField: "stage" },
    },
  ],
};

async function mount(config: Partial<TableViewConfig>) {
  const result = await mountTableView(config);
  apps.push(result.app);
  await settleTable();
  await settleTable();
  if (config.defaultDisplay === "kanban") {
    await vi.waitFor(() =>
      expect(
        [...result.container.querySelectorAll("div")]
          .map((element) => Sortable.get(element))
          .filter(Boolean),
      ).toHaveLength(2),
    );
  }
  return result.container;
}

function click(host: HTMLElement, selector: string) {
  const element = host.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  element.click();
}

function dragCard(host: HTMLElement) {
  const lists = [...host.querySelectorAll("div")]
    .map((element) => Sortable.get(element))
    .filter((list) => list !== undefined);
  const source = lists.find((list) => list.el.children.length > 0);
  const target = lists.find((list) => list !== source);
  if (!source || !target) throw new Error("Missing Kanban columns");
  const item = source.el.children[0];
  if (!(item instanceof HTMLElement)) throw new Error("Missing card");
  const event = new TableDragEvent(source.el, target.el, item);
  source.option("onStart")?.(event);
  target.el.append(item);
  target.option("onAdd")?.(event);
  source.option("onRemove")?.(event);
  source.option("onEnd")?.(event);
}

it.each([false, true])(
  "a Kanban move refreshes all counters only when rejected=%s is false",
  async (rejected) => {
    rejectMove = rejected;
    const host = await mount({ ...boardConfig, defaultDisplay: "kanban" });
    requests.length = 0;
    dragCard(host);
    await settleTable();
    await settleTable();
    expect(requests).toContain("/api/orders/edit");
    expect(requests.includes("/api/orders/count/batch")).toBe(!rejected);
    expect(requests.includes("/api/orders/summary")).toBe(!rejected);
    expect(requests.includes("/api/linked/list")).toBe(!rejected);
  },
  20000,
);

it.each(["table", "kanban"])(
  "realtime row updates refresh counters in %s display",
  async (display) => {
    const host = await mount({ ...boardConfig, defaultDisplay: display });
    requests.length = 0;
    stage = "lost";
    await publishTableEvent("tableview:row:/api/orders", false, {
      type: "updated",
      payload: { ids: ["r1"] },
    });
    await settleTable();
    expect(requests).toEqual(
      expect.arrayContaining([
        "/api/orders/count/batch",
        "/api/orders/summary",
        "/api/linked/list",
      ]),
    );
    if (display === "table") expect(requests).toContain("/api/orders/get");
    expect(host.textContent).toContain("2");
  },
);

const ActionDisplay: FunctionalComponent<{
  context: TableViewDisplayContext<Record<string, unknown>>;
}> = (props) =>
  h(
    "button",
    {
      id: "delete-order",
      onClick: () => props.context.actions.delete(["r1"]),
    },
    "Delete order",
  );

it("a display's write refreshes sibling blocks while manual refresh stays table-only", async () => {
  let siblingReads = 0;
  const sibling = createApp(
    defineComponent({
      setup() {
        usePageLiveRefresh(() => {
          siblingReads += 1;
        });
        return () => h("aside");
      },
    }),
  );
  sibling.mount(document.createElement("div"));
  apps.push(sibling);
  const host = await mount({
    ...boardConfig,
    rowActions: { delete: true },
    displays: [{ id: "test:actions", component: ActionDisplay }],
    defaultDisplay: "test:actions",
  });
  requests.length = 0;
  click(host, "#refresh-trigger");
  await settleTable();
  expect(requests).toContain("/api/orders/list");
  expect(siblingReads).toBe(0);
  requests.length = 0;
  click(host, "#delete-order");
  await settleTable();
  await settleTable();
  expect(requests).toContain("/api/orders/delete");
  expect(requests).toContain("/api/orders/list");
  expect(siblingReads).toBe(1);
});

it("refreshes grouped and tab counters before a pending row refresh completes", async () => {
  const host = await mount({
    ...boardConfig,
    defaultDisplay: "grouped",
    displays: [
      { id: "grouped", options: { groupByField: "stage", count: true } },
    ],
  });
  expect(countIds.some((ids) => ids.includes("lead"))).toBe(true);
  countIds.length = 0;
  holdList = true;
  click(host, "#refresh-trigger");
  await settleTable();
  expect(countIds.some((ids) => ids.includes("lead"))).toBe(true);
  expect(countIds.some((ids) => ids.includes("all"))).toBe(true);
  releaseList();
  await settleTable();
});

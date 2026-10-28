/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { h, type FunctionalComponent } from "vue";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";
import { engine } from "./helpers/api-data-runtime";
import type {
  TableViewConfig,
  TableViewDisplayContext,
} from "../layers/dms-ui/app/composables/table-view/types";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";
import { usePreferences } from "../layers/dms-core/app/composables/user/usePreferences";
import type { TableCountQuery } from "../layers/dms-ui/app/build/composables/table-view/useTableRows";

const apps: Array<{ unmount: () => void }> = [];
const requests: string[] = [];
const queries: Array<TableCountQuery["query"]> = [];
let total = 0;

async function mount(
  config: Partial<TableViewConfig> = {},
  prepare?: () => void,
) {
  const result = await mountTableView(config, prepare);
  apps.push(result.app);
  return result.container;
}

function click(host: HTMLElement, selector: string) {
  const button = host.querySelector(selector);
  if (!(button instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  button.click();
}

function clickText(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Missing ${label}`);
  button.click();
}

function unmount() {
  apps.pop()?.unmount();
}

async function saveSort(id: string) {
  const host = await mount({
    columns: [
      {
        id,
        accessorKey: id,
        header: "Saved column",
        listable: true,
        enableSorting: true,
        type: {
          id: "string",
          compareModes: [],
          filterComponents: {},
          inputComponent: { componentName: "Input" },
        },
      },
    ],
  });
  await settleTable();
  click(host, 'th button:has(span[title="Saved column"])');
  await settleTable();
  click(host, 'th button:has(span[title="Saved column"])');
  await settleTable();
  expect(queries.at(-1)?.sortKey).toBe(id);
  expect(host.querySelector('th[aria-sort="descending"]')).not.toBeNull();
  unmount();
  queries.length = 0;
}

beforeEach(async () => {
  document.cookie = "dms-preferences=; path=/; max-age=0";
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  requests.length = 0;
  queries.length = 0;
  total = 0;
  await tableViewRuntime(
    async (url: string, options?: { query?: TableCountQuery["query"] }) => {
      requests.push(url);
      if (url.endsWith("/list")) queries.push(options?.query ?? {});
      return { results: [], total, offset: 0, limit: 10 };
    },
  );
  usePreferences().removePreference("tables");
});

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
});

it.each([24, 250])(
  "draws a bounded first page of skeleton rows for size %i",
  async (pageSize) => {
    await tableViewRuntime(() => new Promise(() => {}));
    const host = await mount({ pageSize });
    await settleTable();
    expect(host.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(
      Math.min(pageSize, 50),
    );
    expect(host.textContent).not.toContain("dms.blocks.empty");
  },
  20000,
);

it("starts list, tab counts and footer requests before any answer settles", async () => {
  const pending: Array<() => void> = [];
  await tableViewRuntime((url: string) => {
    requests.push(url);
    return new Promise((resolve) =>
      pending.push(() =>
        resolve(
          url.endsWith("/list")
            ? { results: [{ _id: "r1", name: "Order" }], total: 1 }
            : { all: 1, sum: 42 },
        ),
      ),
    );
  });
  const host = await mount({
    tabs: [{ id: "open", label: "Open" }],
    footer: {
      summary: [{ id: "sum", label: "Sum", op: "sum", field: "name" }],
    },
  });
  await settleTable();
  expect(requests).toEqual(
    expect.arrayContaining([
      "/api/orders/list",
      "/api/orders/count/batch",
      "/api/orders/summary",
    ]),
  );
  expect(host.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(
    10,
  );
  pending.forEach((resolve) => resolve());
  await settleTable();
  expect(host.textContent).toContain("42");
});

it.each([500, 404])(
  "hides a settled %i while its retry is pending, then shows the new rows",
  async (statusCode) => {
    const recovered = { results: [{ _id: "r1", name: "Recovered" }], total: 1 };
    let retry = false;
    let answer = (_value: typeof recovered) => {};
    await tableViewRuntime((url: string) => {
      if (!url.endsWith("/list")) return {};
      if (!retry) throw { statusCode, data: { message: "Missing workspace" } };
      return new Promise<typeof recovered>((resolve) => {
        answer = resolve;
      });
    });
    const host = await mount();
    await settleTable();
    expect(host.querySelector("table") === null).toBe(statusCode === 404);
    expect(host.textContent).toContain(
      statusCode === 404 ? "Missing workspace" : "dms.table.load_error_title",
    );
    retry = true;
    const refreshed = refreshPageBlocks();
    await settleTable();
    expect(host.textContent).not.toContain("Missing workspace");
    expect(host.textContent).not.toContain("error.500");
    expect(host.textContent).not.toContain("dms.table.load_error_title");
    expect(host.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(
      10,
    );
    answer(recovered);
    await refreshed;
    await settleTable();
    expect(host.textContent).toContain("Recovered");
  },
);

it.each(["name", "secret", "removed"])(
  "restores only a sortable saved column %s",
  async (id) => {
    await saveSort(id);
    const host = await mount();
    await settleTable();
    expect(queries.at(-1)?.sortKey).toBe(id === "name" ? "name" : undefined);
    expect(host.querySelector('th[aria-sort="descending"]')?.textContent).toBe(
      id === "name" ? "Name" : undefined,
    );
    click(host, 'th button:has(span[title="Name"])');
    await settleTable();
    expect(queries.at(-1)?.sortKey).toBe(id === "name" ? undefined : "name");
    expect(
      host.querySelector('th:has(span[title="Secret"]) button')?.textContent,
    ).not.toContain("Secret");
  },
);

it("a hand-ordered table neither restores nor offers nor overwrites saved sorting", async () => {
  await saveSort("name");
  const host = await mount({ reorder: { field: "position" } });
  await settleTable();
  expect(queries.at(-1)?.sortKey).toBe("position");
  expect(host.querySelector("#sorting-trigger")).toBeNull();
  expect(host.querySelector('th button:has(span[title="Name"])')).toBeNull();
  unmount();
  const restored = await mount();
  await settleTable();
  expect(queries.at(-1)?.sortKey).toBe("name");
  expect(
    restored.querySelector('th[aria-sort="descending"]')?.textContent,
  ).toBe("Name");
});

it("reapplies sorting capability when switching away from a display and back", async () => {
  const host = await mount({
    defaultDisplay: "cards",
    displays: [
      { id: "table" },
      { id: "cards", capabilities: { sorting: false } },
    ],
  });
  await settleTable();
  await vi.waitFor(() =>
    expect(
      host.querySelector(
        '[role="radio"][aria-label="dms.table.view_mode_table"]',
      ),
    ).not.toBeNull(),
  );
  expect(host.querySelector("#sorting-trigger")).toBeNull();
  click(host, '[role="radio"][aria-label="dms.table.view_mode_table"]');
  await settleTable();
  expect(host.querySelector("#sorting-trigger")).not.toBeNull();
  click(host, 'th button:has(span[title="Name"])');
  await settleTable();
  expect(queries.at(-1)?.sortKey).toBe("name");
});

const PagingDisplay: FunctionalComponent<{
  context: TableViewDisplayContext;
}> = ({ context }) =>
  h(
    "button",
    {
      id: "remember-page",
      onClick: () => {
        context.pagination.setPageSize(24);
        context.pagination.setPage(3);
      },
    },
    "Remember page",
  );

const arrivalConfig: Partial<TableViewConfig> = {
  tableId: "content",
  isSoleTableView: true,
  tabs: [{ id: "open", label: "Open" }],
  displays: [
    { id: "table" },
    { id: "cards" },
    { id: "test:paging", component: PagingDisplay },
  ],
  views: {
    layout: "strip",
    items: [
      {
        id: "kept",
        label: "Kept view",
        sort: [{ field: "name", desc: true }],
        filters: [{ accessorKey: "secret", mode: "is", value: "remembered" }],
        columns: { hidden: ["secret"] },
        display: "test:paging",
      },
    ],
  },
};

async function saveArrival(display = "table") {
  total = 100;
  const host = await mount(arrivalConfig);
  await settleTable();
  clickText(host, "Kept view");
  await settleTable();
  clickText(host, "Open");
  await settleTable();
  click(host, "#remember-page");
  await settleTable();
  click(host, `[role="radio"][aria-label="dms.table.view_mode_${display}"]`);
  await settleTable();
  expect(queries.at(-1)).toMatchObject({
    sortKey: "name",
    filter_secret: "is:remembered",
    offset: 72,
  });
  expect(
    host.querySelector('button[aria-pressed="true"]')?.textContent?.trim(),
  ).toBe("Kept view");
  unmount();
  queries.length = 0;
}

function arrive(query: Record<string, string>) {
  Object.assign(engine.useDmsRoute(), { path: "/orders", query });
  window.history.replaceState(
    null,
    "",
    `/orders?${new URLSearchParams(query)}`,
  );
}

it.each([true, false])(
  "startup tracking treats prefetch=%s differently from a link to the kept tab",
  async (prefetch) => {
    await saveArrival();
    const host = await mount(arrivalConfig, () => {
      arrive({ tab: "open" });
      window.dispatchEvent(new PopStateEvent("popstate"));
      document.dispatchEvent(
        new CustomEvent("inertia:before", { detail: { visit: { prefetch } } }),
      );
    });
    await settleTable();
    expect(queries.at(-1)?.sortKey).toBe(prefetch ? "name" : undefined);
    expect(queries[0]?.offset).toBe(prefetch ? 72 : 0);
    expect(queries.at(-1)?.filter_secret).toBe(
      prefetch ? "is:remembered" : undefined,
    );
    expect(
      host.querySelector('button[aria-pressed="true"]')?.textContent?.trim(),
    ).toBe(prefetch ? "Kept view" : undefined);
    unmount();
    const restored = await mount(arrivalConfig, () => {
      arrive({});
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await settleTable();
    expect(queries.at(-1)?.sortKey).toBe("name");
    expect(queries.at(-1)?.filter_secret).toBe("is:remembered");
    expect(
      restored
        .querySelector('button[aria-pressed="true"]')
        ?.textContent?.trim(),
    ).toBe("Kept view");
  },
);

it("a same-page link resets the listing without keeping it until the user's next sort", async () => {
  await saveArrival();
  const host = await mount(arrivalConfig, () => {
    arrive({ tab: "open" });
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await settleTable();
  expect(queries.at(-1)?.sortKey).toBe("name");
  document.dispatchEvent(
    new CustomEvent("inertia:clientVisit", {
      detail: {
        page: { url: "/orders?content.tab=open" },
        visitId: "link-1",
        replace: false,
      },
    }),
  );
  await settleTable();
  expect(queries.at(-1)).toMatchObject({ offset: 0 });
  expect(queries.at(-1)?.sortKey).toBeUndefined();
  expect(queries.at(-1)?.filter_secret).toBeUndefined();
  expect(host.querySelector('button[aria-pressed="true"]')).toBeNull();
  click(host, 'th button:has(span[title="Name"])');
  await settleTable();
  expect(queries.at(-1)?.sortKey).toBe("name");
  expect(host.querySelector('th[aria-sort="ascending"]')?.textContent).toBe(
    "Name",
  );
  unmount();
  const restored = await mount(arrivalConfig, () => {
    arrive({});
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await settleTable();
  expect(restored.querySelector('button[aria-pressed="true"]')).toBeNull();
  expect(restored.querySelector('th[aria-sort="ascending"]')?.textContent).toBe(
    "Name",
  );
  expect(queries.at(-1)?.filter_secret).toBeUndefined();
});

it("sanitizes an unavailable sort applied by opening a named view", async () => {
  const host = await mount({
    views: {
      layout: "strip",
      items: [
        {
          id: "invalid",
          label: "Old view",
          sort: [{ field: "secret", desc: true }],
        },
      ],
    },
  });
  await settleTable();
  const view = [...host.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Old view",
  );
  if (!view) throw new Error("Missing saved view");
  view.click();
  await settleTable();
  expect(view.getAttribute("aria-pressed")).toBe("true");
  expect(queries.every((query) => query.sortKey !== "secret")).toBe(true);
  expect(
    host.querySelector('th[aria-sort="ascending"], th[aria-sort="descending"]'),
  ).toBeNull();
  unmount();
  const restored = await mount();
  await settleTable();
  expect(queries.at(-1)?.sortKey).toBeUndefined();
  expect(restored.querySelector('th[aria-sort="descending"]')).toBeNull();
});

it("a linked URL filter keeps presentation choices but not the remembered listing", async () => {
  await saveArrival("cards");
  const host = await mount(
    {
      ...arrivalConfig,
      queryParamFilters: { customer: { field: "customerId" } },
    },
    () => {
      arrive({ customer: "c1" });
    },
  );
  await settleTable();
  expect(queries.at(-1)).toMatchObject({
    filter_customerId: "is:c1",
    offset: 0,
  });
  expect(queries.at(-1)?.sortKey).toBeUndefined();
  expect(queries.at(-1)?.filter_secret).toBeUndefined();
  expect(
    host
      .querySelector('[role="radio"][aria-checked="true"]')
      ?.getAttribute("aria-label"),
  ).toBe("dms.table.view_mode_cards");
  click(host, '[role="radio"][aria-label="dms.table.view_mode_table"]');
  await settleTable();
  expect(host.querySelector('th:has(span[title="Secret"])')).toBeNull();
  expect(host.querySelector('th:has(span[title="Name"])')).not.toBeNull();
  unmount();
  const restored = await mount(arrivalConfig, () => {
    arrive({});
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await settleTable();
  expect(
    restored.querySelector('button[aria-pressed="true"]')?.textContent?.trim(),
  ).toBe("Kept view");
  expect(queries.at(-1)?.sortKey).toBe("name");
  expect(queries.at(-1)?.filter_secret).toBe("is:remembered");
});

it("a settled not-found replaces even previously loaded rows and all table controls", async () => {
  let missing = false;
  await tableViewRuntime(async (url: string) => {
    if (url.endsWith("/list") && missing) {
      throw { statusCode: 404, data: { message: "Workspace deleted" } };
    }
    return { results: [{ _id: "r1", name: "Old order" }], total: 1 };
  });
  const host = await mount();
  await settleTable();
  expect(host.textContent).toContain("Old order");
  missing = true;
  await refreshPageBlocks();
  await settleTable();
  expect(host.textContent).toContain("Workspace deleted");
  expect(host.textContent).not.toContain("Old order");
  expect(host.textContent).not.toContain("dms.table.load_error_title");
  expect(host.querySelector("table, #refresh-trigger")).toBeNull();
});

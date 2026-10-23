// @vitest-environment jsdom
/**
 * A read-only list (an array or key-value field shown, not edited) reads as
 * a table of values: each cell drawn as the grid draws it (amounts
 * right-aligned, a relation by its name), scrolling sideways when its
 * columns cannot fit, each row stacked as `label value` lines in a narrow
 * container.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vue from "vue";
import { createApp, h, nextTick, ref, type App } from "vue";
import RepeaterTable from "../layers/dms-ui/app/components/form/components/RepeaterTable.vue";
import {
  joinRelationValue,
  relationLabelSource,
} from "../layers/dms-ui/app/build/composables/form/repeaterTable";
import {
  NotFoundRelation,
  relationSelectSource,
} from "../layers/dms-ui/app/build/composables/data-types/relationRows";

// The relation data type, as it registers its `select` route.
const RELATION_TYPE = { selectSource: relationSelectSource };

const PRODUCT = {
  id: "product",
  label: "Product",
  type: "relation",
  component: {
    componentName: "dms-relation",
    options: {
      searchUrl: "/products/select",
      keyMapping: { label: "name", value: "_id" },
    },
  },
};
const UNIT_PRICE = {
  id: "unitPrice",
  label: "Unit price",
  type: "price",
  component: { componentName: "dms-input-number" },
};

describe("a relation column of a read-only list", () => {
  it("reads its names from the picker's endpoint", () => {
    expect(relationLabelSource(PRODUCT, RELATION_TYPE)).toEqual({
      searchUrl: "/products/select",
      keyMapping: { label: "name", value: "_id" },
      multiple: false,
    });
    // A type that names no `select` route has no rows to read.
    expect(relationLabelSource(UNIT_PRICE, {})).toBeUndefined();
    expect(relationLabelSource(UNIT_PRICE, undefined)).toBeUndefined();
  });

  it("puts the related row in place of each id it knows, and marks an unanswered one not found", () => {
    const rowsByValue = new Map([["p1", { _id: "p1", name: "Panel" }]]);
    const read = { rowsByValue, readIds: new Set(["p1", "gone"]) };
    expect(joinRelationValue("p1", read, false)).toEqual(rowsByValue.get("p1"));
    expect(joinRelationValue("gone", read, false)).toEqual(
      new NotFoundRelation("gone"),
    );
    expect(joinRelationValue(["p1", "gone"], read, true)).toEqual([
      rowsByValue.get("p1"),
      new NotFoundRelation("gone"),
    ]);
    // An id not read yet stays as it is: it is not known to be missing.
    expect(
      joinRelationValue("p2", { rowsByValue, readIds: new Set() }, false),
    ).toBe("p2");
  });
});

const QUANTITY = {
  id: "quantity",
  label: "Qty",
  type: "number",
  component: { componentName: "dms-input-number" },
};

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function mountTable(
  rows: Record<string, unknown>[],
  columns: Record<string, unknown>[] = [PRODUCT, UNIT_PRICE],
) {
  for (const name of ["computed", "ref"]) {
    vi.stubGlobal(name, vue[name as keyof typeof vue]);
  }
  const formatters: Record<string, (value: unknown) => string> = {
    relation: (value) =>
      typeof value === "object" && value
        ? String((value as { name: string }).name)
        : String(value),
    price: (value) => `€${value}`,
    number: (value) => String(value),
  };
  vi.stubGlobal("useDataTypes", () => ({
    getDataType: (id: string) =>
      formatters[id]
        ? {
            formatter: { default: formatters[id] },
            ...(id === "relation" ? RELATION_TYPE : {}),
          }
        : undefined,
  }));
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en"),
    t: (key: string) => key,
  }));
  const fetched: { url: string; params: unknown }[] = [];
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: vi.fn(async (url: string, options: { params: unknown }) => {
      fetched.push({ url, params: options.params });
      return { results: [{ _id: "p1", name: "Panel" }] };
    }),
  }));
  const requested: string[] = [];
  vi.stubGlobal(
    "useDmsAsyncData",
    (key: string, read: () => Promise<unknown>) => {
      requested.push(key);
      const data = ref<unknown>();
      void read().then((rows) => (data.value = rows));
      return { data };
    },
  );
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () => h(RepeaterTable, { columns, rows }),
  });
  app.mount(host);
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
  return { host, requested, fetched };
}

describe("a read-only list's rows", () => {
  it("read as a table of values, a relation by its name", async () => {
    const { host, requested } = await mountTable([
      { product: "p1", unitPrice: 319 },
    ]);
    expect(host.querySelectorAll("input")).toHaveLength(0);
    const heads = [...host.querySelectorAll("th")];
    expect(heads.map((head) => head.textContent?.trim())).toEqual([
      "Product",
      "Unit price",
    ]);
    const cells = [...host.querySelectorAll("tbody td")];
    expect(cells.map((cell) => cell.textContent?.trim())).toEqual([
      "Panel",
      "€319",
    ]);
    // One request per relation column, shared by its cells.
    expect(requested).toHaveLength(1);
  });

  it("read each relation column's own ids, two columns naming the same route", async () => {
    const REPLACES = { ...PRODUCT, id: "replaces", label: "Replaces" };
    const { requested, fetched } = await mountTable(
      [{ product: "p1", replaces: "p9" }],
      [PRODUCT, REPLACES],
    );
    expect(new Set(requested).size).toBe(2);
    expect(fetched.map((read) => read.params)).toEqual([
      { ids: ["p1"], idKey: "_id", limit: 1 },
      { ids: ["p9"], idKey: "_id", limit: 1 },
    ]);
  });

  it("read a relation's names for the ids its rows hold, not a page of the route", async () => {
    const { fetched } = await mountTable([
      { product: "p1", unitPrice: 319 },
      { product: "p2", unitPrice: 20 },
      { product: "p1", unitPrice: 5 },
    ]);
    expect(fetched).toEqual([
      {
        url: "/products/select",
        params: { ids: ["p1", "p2"], idKey: "_id", limit: 2 },
      },
    ]);
  });

  it("align amounts on the right, and scroll sideways rather than overflow", async () => {
    const { host } = await mountTable([{ product: "p1", unitPrice: 319 }]);
    const [, priceHead] = host.querySelectorAll("th");
    const [productCell, priceCell] = host.querySelectorAll("tbody td");
    expect(priceHead!.className).toContain("text-end");
    expect(priceCell!.className).toContain("text-end");
    expect(productCell!.className).not.toContain("text-end");
    const scroller = host.querySelector("table")!.parentElement!;
    expect(scroller.className).toContain("overflow-x-auto");
  });

  it("draw amounts in the form's tabular figures, not the grid's mono", async () => {
    const { host } = await mountTable([{ product: "p1", unitPrice: 319 }]);
    const amount = host.querySelector("tbody td:last-child span")!;
    expect(amount.className).toContain("tabular-nums");
    expect(amount.className).not.toContain("font-mono");
  });

  it("wrap text between words, never inside one", async () => {
    const { host } = await mountTable([{ product: "p1", unitPrice: 319 }]);
    const [productCell] = host.querySelectorAll("tbody td");
    expect(productCell!.className).toContain("[overflow-wrap:break-word]");
    expect(productCell!.className).not.toContain("anywhere");
  });
});

describe("a read-only list in a narrow container", () => {
  const COLUMNS = [PRODUCT, QUANTITY, UNIT_PRICE];

  it("stacks each row as its fields' labels beside their values", async () => {
    const { host } = await mountTable(
      [
        { product: "p1", quantity: 269, unitPrice: 319 },
        { product: "p1", quantity: 6, unitPrice: 3990 },
      ],
      COLUMNS,
    );
    const blocks = [...host.querySelectorAll("li")];
    expect(blocks).toHaveLength(2);
    const lines = [...blocks[1]!.querySelectorAll("dt")].map((term) => [
      term.textContent?.trim(),
      term.nextElementSibling?.textContent?.trim(),
    ]);
    expect(lines).toEqual([
      ["Product", "Panel"],
      ["Qty", "6"],
      ["Unit price", "€3990"],
    ]);
  });

  it("swaps the table for the blocks below the container's `@md` width", async () => {
    const { host } = await mountTable([{ product: "p1" }], COLUMNS);
    expect(host.firstElementChild!.className).toContain("@container");
    const scroller = host.querySelector("table")!.parentElement!;
    expect(scroller.className).toContain("hidden @md:block");
    expect(host.querySelector("ul")!.className).toContain("@md:hidden");
  });

  it("never wraps an amount, which keeps its whole value", async () => {
    const { host } = await mountTable([{ product: "p1" }], COLUMNS);
    const [productValue, , priceValue] = host.querySelectorAll("dd");
    expect(priceValue!.className).toContain("whitespace-nowrap");
    expect(priceValue!.className).toContain("text-end");
    expect(productValue!.className).toContain("[overflow-wrap:break-word]");
  });

  it("keeps a two-field list a table at any width", async () => {
    const { host } = await mountTable([{ product: "p1", unitPrice: 319 }]);
    expect(host.querySelector("ul")).toBeNull();
    const scroller = host.querySelector("table")!.parentElement!;
    expect(scroller.className).not.toContain("hidden");
  });
});

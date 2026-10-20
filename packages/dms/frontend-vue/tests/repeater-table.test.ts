// @vitest-environment jsdom
/**
 * A read-only list (an array or key-value field shown, not edited) reads as
 * a table of values: each cell drawn as the grid draws it (amounts
 * right-aligned, a relation by its name), scrolling sideways when its
 * columns cannot fit.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vue from "vue";
import { createApp, h, nextTick, ref, type App } from "vue";
import RepeaterTable from "../layers/dms-ui/app/components/form/components/RepeaterTable.vue";
import {
  joinRelationValue,
  relationLabelSource,
} from "../layers/dms-ui/app/build/composables/form/repeaterTable";

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
    expect(relationLabelSource(PRODUCT)).toEqual({
      url: "/products/select",
      valueKey: "_id",
      multiple: false,
    });
    expect(relationLabelSource(UNIT_PRICE)).toBeUndefined();
  });

  it("puts the related row in place of each id it knows", () => {
    const rows = new Map([["p1", { _id: "p1", name: "Panel" }]]);
    expect(joinRelationValue("p1", rows, false)).toEqual(rows.get("p1"));
    expect(joinRelationValue("gone", rows, false)).toBe("gone");
    expect(joinRelationValue(["p1", "gone"], rows, true)).toEqual([
      rows.get("p1"),
      "gone",
    ]);
  });
});

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function mountTable(rows: Record<string, unknown>[]) {
  for (const name of ["computed", "ref"]) {
    vi.stubGlobal(name, vue[name as keyof typeof vue]);
  }
  const formatters: Record<string, (value: unknown) => string> = {
    relation: (value) =>
      typeof value === "object" && value
        ? String((value as { name: string }).name)
        : String(value),
    price: (value) => `€${value}`,
  };
  vi.stubGlobal("useDataTypes", () => ({
    getDataType: (id: string) =>
      formatters[id] ? { formatter: { default: formatters[id] } } : undefined,
  }));
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en"),
    t: (key: string) => key,
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  const requested: string[] = [];
  vi.stubGlobal("useDmsAsyncData", (key: string) => {
    requested.push(key);
    return { data: ref({ results: [{ _id: "p1", name: "Panel" }] }) };
  });
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () => h(RepeaterTable, { columns: [PRODUCT, UNIT_PRICE], rows }),
  });
  app.mount(host);
  await nextTick();
  return { host, requested };
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
    expect(requested).toEqual(["repeater-table-relation-/products/select"]);
  });

  it("align amounts on the right, and scroll sideways rather than overflow", async () => {
    const { host } = await mountTable([{ product: "p1", unitPrice: 319 }]);
    const [, priceHead] = host.querySelectorAll("th");
    const [productCell, priceCell] = host.querySelectorAll("tbody td");
    expect(priceHead!.className).toContain("text-end");
    expect(priceCell!.className).toContain("text-end");
    expect(productCell!.className).not.toContain("text-end");
    expect(host.firstElementChild!.className).toContain("overflow-x-auto");
  });
});

/** @vitest-environment jsdom */
/**
 * A relation cell whose joined row has no label shows the row's key, never
 * the row itself stringified (`[object Object]`), and a multiple relation
 * keeps a badge for it.
 */
import { h, isVNode } from "vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  DataType,
  DataTypeFormatter,
} from "../layers/dms-core/app/composables/data-types/useDataType";
import { Size } from "../layers/dms-core/app/types/size";
import { isObject } from "../layers/dms-core/app/utils/type-check";

interface RelationOptions {
  multiple?: boolean;
  keyMapping?: { label?: string; value?: string };
}

type RelationRow = Record<string, string | number | null>;

const formatters = new Map<string, DataTypeFormatter | undefined>();
const register = (dataType: DataType) =>
  formatters.set(dataType.id, dataType.formatter?.default);

beforeAll(async () => {
  vi.stubGlobal("h", h);
  vi.stubGlobal("isObject", isObject);
  vi.stubGlobal("Size", Size);
  for (const name of ["formatNumber", "formatPrice", "formatPercentage"]) {
    vi.stubGlobal(name, () => "");
  }
  vi.stubGlobal("useDmsApp", () => ({ $i18n: { t: (key: string) => key } }));
  vi.stubGlobal("useDataTypes", () => ({ registerDataType: register }));
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/entries/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

const renderRelation = (
  value: RelationRow | RelationRow[],
  options: RelationOptions,
) => formatters.get("relation")!(value, "en-GB", options);

describe("relation cell without a label", () => {
  const options = { keyMapping: { label: "id", value: "_id" } };

  it("shows the row's key when the label is empty", () => {
    expect(renderRelation({ _id: "ord-7", id: "" }, options)).toBe("ord-7");
  });

  it("shows the row's key when the label is null", () => {
    expect(renderRelation({ _id: "ord-7", id: null }, options)).toBe("ord-7");
  });

  it("reads the key from the default value key when none is mapped", () => {
    expect(renderRelation({ _id: "emp-3", name: null }, {})).toBe("emp-3");
  });

  it("keeps the label when there is one", () => {
    expect(renderRelation({ _id: "ord-7", id: 1042 }, options)).toBe("1042");
  });

  it("keeps a label of 0", () => {
    expect(renderRelation({ _id: "ord-7", id: 0 }, options)).toBe("0");
  });
});

describe("multiple relation cell without a label", () => {
  const options = { multiple: true, keyMapping: { label: "name" } };

  const badgeLabels = (value: RelationRow[]) => {
    const cell = renderRelation(value, options);
    if (!isVNode(cell) || !Array.isArray(cell.children)) {
      throw new Error("expected a vnode of badges");
    }
    expect(cell.children.every(isVNode)).toBe(true);
    return cell.children
      .filter(isVNode)
      .map((badge) => String(badge.props?.label));
  };

  it("keeps a badge with the row's key for an empty or null label", () => {
    expect(
      badgeLabels([
        { _id: "role-1", name: "" },
        { _id: "role-2", name: "Admin" },
        { _id: "role-3", name: null },
      ]),
    ).toEqual(["role-1", "Admin", "role-3"]);
  });

  it("keeps a badge labelled 0", () => {
    expect(badgeLabels([{ _id: "role-1", name: 0 }])).toEqual(["0"]);
  });
});

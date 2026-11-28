/**
 * Where a value is shown in full, an array, key-value or code value is drawn
 * whole, its option texts in the reader's language; with nothing to list it
 * reads as its count.
 *
 * @packageDocumentation
 */
import { isVNode } from "vue";
import * as vue from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  DataType,
  DataTypeFormatter,
} from "../layers/dms-core/app/composables/data-types/useDataType";
import { registerFieldTypes } from "../layers/dms-ui/app/entries/composables/data-types/registerFieldTypes";
import { defined } from "./helpers/defined";

const TEXT = { componentName: "dms-input-text" };
const ARRAY_OPTIONS = {
  columns: [
    { id: "sku", label: "$lines.sku", type: "string", component: TEXT },
  ],
};
const PAIR_OPTIONS = { value: { type: "string", component: TEXT } };

const dataTypes = new Map<string, DataType>();
registerFieldTypes((dataType) => dataTypes.set(dataType.id, dataType));

const full = (
  id: string,
  value: Parameters<DataTypeFormatter>[0],
  options?: Parameters<DataTypeFormatter>[2],
) => defined(defined(dataTypes.get(id)).formatter?.full)(value, "en", options);

const props = (drawn: ReturnType<typeof full>) =>
  isVNode(drawn) ? drawn.props : undefined;

beforeEach(() => {
  vi.stubGlobal("h", vue.h);
  vi.stubGlobal("useDmsApp", () => ({
    $i18n: { t: (key: string) => `t:${key}` },
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("lists the rows of an array under its translated headers", () => {
  const rows = [{ sku: "A" }, { sku: "B" }];
  expect(props(full("array", rows, ARRAY_OPTIONS))).toEqual({
    columns: [{ ...ARRAY_OPTIONS.columns[0], label: "t:lines.sku" }],
    rows,
  });
});

it("lists the pairs of a key-value object", () => {
  const drawn = props(full("key_value", { Color: "Red" }, PAIR_OPTIONS));
  expect(drawn?.rows).toEqual([{ key: "Color", value: "Red" }]);
  expect(
    drawn?.columns.map((column: { label?: string }) => column.label),
  ).toEqual(["t:dms.form.key_value.key", "t:dms.form.key_value.value"]);
});

it("lists a toggleable pair's value beside its state", () => {
  const drawn = props(
    full(
      "key_value",
      { Color: { value: "Red", enabled: false } },
      { ...PAIR_OPTIONS, toggleable: true },
    ),
  );
  expect(drawn?.rows).toEqual([{ key: "Color", value: "Red", enabled: false }]);
  expect(drawn?.columns).toHaveLength(3);
});

it.each([
  ["array", [], ARRAY_OPTIONS, "t:dms.form.repeater.count"],
  ["array", [{ sku: "A" }], undefined, "t:dms.form.repeater.count"],
  ["key_value", {}, PAIR_OPTIONS, "t:dms.form.key_value.count"],
])("counts a %s it cannot list", (id, value, options, count) => {
  expect(full(id, value, options)).toBe(count);
});

it("keeps every line of a code", () => {
  const drawn = full("code", "a\n  b");
  expect(isVNode(drawn) && drawn.children).toBe("a\n  b");
});

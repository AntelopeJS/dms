import assert from "node:assert/strict";
import test from "node:test";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import {
  PriceType,
  SelectType,
} from "../dist/base/data-types/default/choices.js";
import { TableView } from "../dist/base/table-view/factory.js";
import { TableViewMeta } from "../dist/base/table-view/meta.js";

const STATUS = { column: "status" };
const CURRENCY = { column: "currency" };
const SELECT_DISPLAYS = /** @type {const} */ ([
  "dropdown",
  "cards",
  "segmented",
  "radio",
]);

/**
 * @param {import("../dist/component.js").ComponentInfoSerialized} component
 * @param {string} key
 * @returns {unknown}
 */
const optionOf = (component, key) => {
  /** @type {unknown} */
  const value = Object.getOwnPropertyDescriptor(
    Object(component.options),
    key,
  )?.value;
  return value;
};

/** @param {{ filterable: boolean }} column */
const ordersWith = (column) => {
  class Orders {}
  GetMetadata(Orders, TableViewMeta).setColumn("status", {
    type: new SelectType({ items: [], itemsFrom: STATUS }),
    ...column,
  });
  GetMetadata(Orders, DataAPIMeta).field("status");
  return Orders;
};

await test("a select reading its items from a column accepts any text, and a list of texts when multiple", () => {
  const single = new SelectType({ items: [], itemsFrom: STATUS });
  assert.equal(single.getValidation().safeParse("zq_paid").success, true);
  assert.equal(single.getValidation().safeParse(3).success, false);
  const multiple = new SelectType({
    items: [],
    itemsFrom: STATUS,
    multiple: true,
  });
  assert.equal(
    multiple.getValidation().safeParse(["zq_paid", "zq_held"]).success,
    true,
  );
  assert.equal(multiple.getValidation().safeParse("zq_paid").success, false);
});

await test("a select listing its items accepts only those, with or without any", () => {
  const listed = new SelectType({ items: [{ label: "Paid", value: "paid" }] });
  assert.equal(listed.getValidation().safeParse("paid").success, true);
  assert.equal(listed.getValidation().safeParse("held").success, false);
  const empty = new SelectType({ items: [] });
  assert.equal(empty.getValidation().safeParse("paid").success, false);
});

await test("every input of a select reading from a column carries the column for the table view to fill", () => {
  for (const display of SELECT_DISPLAYS) {
    const select = new SelectType({ items: [], itemsFrom: STATUS, display });
    assert.deepEqual(
      optionOf(select.inputComponent(), "itemsFrom"),
      STATUS,
      display,
    );
    assert.deepEqual(
      optionOf(select.filterComponents().default, "itemsFrom"),
      STATUS,
      display,
    );
  }
});

await test("a price reads its currency from a column unless it states one", () => {
  const read = new PriceType({ currencyFrom: CURRENCY }).inputComponent();
  assert.deepEqual(optionOf(read, "currencyFrom"), CURRENCY);
  assert.equal(optionOf(read, "currency"), undefined);
  const stated = new PriceType({
    currency: "USD",
    currencyFrom: CURRENCY,
  }).inputComponent();
  assert.equal(optionOf(stated, "currency"), "USD");
  assert.equal(optionOf(stated, "currencyFrom"), undefined);
});

await test("a table view refuses tabs listed and read from a column at once", () => {
  assert.throws(
    () =>
      TableView(ordersWith({ filterable: true }), {
        tabs: [{ id: "all", label: "All" }],
        tabsFrom: STATUS,
      }),
    /both tabs and tabsFrom/,
  );
});

await test("a table view refuses tabs read from a column it cannot filter on", () => {
  assert.throws(
    () => TableView(ordersWith({ filterable: false }), { tabsFrom: STATUS }),
    /tabsFrom .* not a filterable column/,
  );
});

/** @vitest-environment jsdom */
/**
 * A Matrix that follows a field of the form beside it (`followField`): the
 * DMS form sends each field change on `window`, and the grid reads its rows
 * again with the field's value, so a column the route computes from it
 * follows what is typed. An edit is sent with that value in its query.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FormEvents } from "../layers/dms-ui/app/composables/form/types/events";
import { followedValue } from "../layers/dms-ui/app/entries/composables/matrix/useFollowedField";
import {
  mountMatrix,
  stubMatrixRuntime,
  type MatrixReadQuery,
} from "./helpers/matrix-runtime";

/** What the route answers: the share of a 50-unit stock an order of `quantity` takes. */
function gridAt(query: MatrixReadQuery) {
  const quantity =
    query?.quantity === undefined ? 50 : Number(query.quantity || 0);
  return {
    rows: [
      {
        id: "r1",
        label: "Desk",
        values: { stock: 50, share: Math.min(quantity, 50) },
      },
    ],
  };
}

const reads: MatrixReadQuery[] = [];
let unmount: (() => void) | undefined;

beforeEach(async () => {
  reads.length = 0;
  await stubMatrixRuntime(
    () => ({}),
    (query) => {
      reads.push(query);
      return gridAt(query);
    },
  );
});

afterEach(() => {
  unmount?.();
  vi.unstubAllGlobals();
});

/** Sends a field change as the DMS form does. */
function fieldChange(
  component: string,
  fieldId: string,
  value: number | string | null,
) {
  window.dispatchEvent(
    new CustomEvent(FormEvents.FIELD_CHANGE, {
      detail: {
        component,
        data: { fieldId, value, formValues: {}, initial: false },
      },
    }),
  );
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 6; pass += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function mountGrid() {
  const grid = await mountMatrix({
    fetchUrl: "/api/orders/o1/grid",
    followField: { block: "order", field: "quantity", param: "quantity" },
    columns: [
      { id: "stock", label: "Stock", kind: "number" },
      { id: "share", label: "This order", kind: "number" },
    ],
  });
  unmount = grid.unmount;
  await settle();
  return grid;
}

it("reads the grid again with the quantity typed in the form beside it, so the order's share reads 30 once 30 is typed (fails when the grid keeps the 50 it opened with)", async () => {
  const { cellOf } = await mountGrid();
  const opened = cellOf("r1", "share")?.textContent ?? "";

  fieldChange("order", "quantity", 30);
  await settle();

  expect(opened).toContain("50");
  expect(reads.at(-1)).toMatchObject({ quantity: "30" });
  expect(cellOf("r1", "share")?.textContent).toContain("30");
});

it("ignores a change of another field or of another block, and sends an emptied field empty (fails when another field or form moves the grid, or an emptied quantity brings back the first answer)", async () => {
  await mountGrid();

  fieldChange("order", "note", "rush");
  fieldChange("other-form", "quantity", 5);
  await settle();
  const ignored = reads.filter((query) => query?.quantity !== undefined);
  fieldChange("order", "quantity", null);
  await settle();

  expect(ignored).toEqual([]);
  expect(reads.at(-1)).toMatchObject({ quantity: "" });
  expect([
    followedValue(30.5),
    followedValue(null),
    followedValue(Number.NaN),
    followedValue("12"),
  ]).toEqual(["30.5", "", "", "12"]);
});

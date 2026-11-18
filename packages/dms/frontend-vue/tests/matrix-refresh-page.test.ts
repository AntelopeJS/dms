/** @vitest-environment jsdom */
/**
 * A Matrix with `refreshPageOnSave` asks the page's other blocks to read
 * their data again once a save landed without an error or a conflict: a
 * form whose values follow the grid shows them at once. A save the route
 * refused in part leaves the page as it is.
 */
import { afterEach, expect, it, vi } from "vitest";
import { BLOCK_REFRESH_EVENT } from "../layers/dms-ui/app/utils/blockRefresh";
import {
  mountMatrix,
  press,
  stubMatrixRuntime,
  typeInto,
} from "./helpers/matrix-runtime";
import type { ApiAnswer } from "./helpers/api-data-runtime";
import type { MatrixData } from "../layers/dms-ui/app/types/matrix";

const GRID: MatrixData = {
  columns: [{ id: "qty", label: "Quantity", kind: "number" }],
  rows: [
    { id: "r1", label: "Desk", values: { qty: 2 } },
    { id: "r2", label: "Lamp", values: { qty: 5 } },
  ],
};

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
});

/** Saves 3 in the first row's quantity, the route answering `answer`; the page refreshes it set off. */
async function saveQuantity(
  refreshPageOnSave: boolean,
  answer: ApiAnswer,
) {
  const saves = await stubMatrixRuntime(() => answer);
  const refreshes = vi.fn();
  window.addEventListener(BLOCK_REFRESH_EVENT, refreshes);
  const grid = await mountMatrix({
    saveUrl: "/api/products/grid/save",
    staticData: GRID,
    refreshPageOnSave,
  });
  cleanup = () => {
    grid.unmount();
    window.removeEventListener(BLOCK_REFRESH_EVENT, refreshes);
  };
  const input = await grid.openEditor("r1", "qty");
  await typeInto(input, "3");
  press(input, "Enter");
  await vi.waitFor(() => expect(saves).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return refreshes;
}

it("asks the page's blocks to read again after a clean save (fails when a form beside the grid keeps the values it read before the save)", async () => {
  const refreshes = await saveQuantity(true, {});
  expect(refreshes).toHaveBeenCalledTimes(1);
});

it("leaves the page alone after a save the route refused in part, and without the option (fails when a refused change refreshes the page, or every grid does)", async () => {
  const refused = await saveQuantity(true, {
    errors: [{ rowId: "r1", columnId: "qty", message: "Too many." }],
  });
  cleanup?.();
  const unasked = await saveQuantity(false, {});
  expect([refused.mock.calls.length, unasked.mock.calls.length]).toEqual([
    0, 0,
  ]);
});

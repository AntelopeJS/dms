// @vitest-environment jsdom
/**
 * The table's `rowClick` mode: whether a pointer event dispatched on a row's
 * cell (or on its content) runs the row action, read while the event is on
 * the row, whose `currentTarget` the guards read.
 */
import { describe, expect, it } from "vitest";
import { isRowClickTrigger } from "../layers/dms-ui/app/build/utils/rowClickTrigger";

describe("row click mode", () => {
  type Mode = "single" | "double" | undefined;

  const triggers = (
    mode: Mode,
    type: string,
    init: MouseEventInit = {},
    inner?: string,
  ): boolean => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    row.append(cell);
    if (inner) cell.innerHTML = inner;
    document.body.append(row);
    let result = false;
    row.addEventListener(type, (event) => {
      result = isRowClickTrigger(mode, event as MouseEvent);
    });
    const target = cell.firstElementChild ?? cell;
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
    row.remove();
    return result;
  };
  const expectTrigger = (
    mode: Mode,
    type: string,
    expected: boolean,
    init: MouseEventInit = {},
    inner?: string,
  ) => expect(triggers(mode, type, init, inner)).toBe(expected);

  it("runs the row action on a double-click by default", () => {
    expectTrigger(undefined, "dblclick", true);
    expectTrigger(undefined, "click", false, { detail: 1 });
    expectTrigger("double", "dblclick", true);
  });

  it("runs it on a single click with rowClick: single", () => {
    expectTrigger("single", "click", true, { detail: 1 });
    expectTrigger("single", "dblclick", false);
    expectTrigger("single", "click", false, { detail: 2 });
  });

  it("runs it on neither click with rowClick: none", () => {
    expectTrigger("none", "click", false, { detail: 1 });
    expectTrigger("none", "dblclick", false);
  });

  it("leaves a single click on a control of the row to the control", () => {
    expectTrigger(
      "single",
      "click",
      false,
      { detail: 1 },
      "<button>Menu</button>",
    );
    expectTrigger(
      "single",
      "click",
      false,
      { detail: 1 },
      '<a href="#">Link</a>',
    );
    expectTrigger("single", "click", true, { detail: 1 }, "<span>Text</span>");
  });

  it("leaves a click ending a text selection alone", () => {
    const text = document.createElement("p");
    text.textContent = "GET /api/search";
    document.body.append(text);
    window.getSelection()?.selectAllChildren(text);
    expectTrigger("single", "click", false, { detail: 1 });
    window.getSelection()?.removeAllRanges();
    text.remove();
  });
});

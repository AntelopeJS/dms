import { describe, expect, it } from "vitest";
import {
  buildPermissionIndex,
  checkboxState,
  clickPermission,
  grantableBy,
} from "../layers/dms-layout/app/entries/components/pages/settings/roles/role-permissions";
import {
  TREE,
  clickedValue,
  sorted,
} from "./helpers/role-permissions-fixtures";

const ORDERS = "pages.sales.orders";
const READ = "pages.sales.orders.read";
const REFUND = "pages.sales.orders.refund";
const HELD = new Set(["pages", "pages.sales", ORDERS, READ]);

describe("role permissions an editor may grant", () => {
  const index = buildPermissionIndex(TREE);
  const click = (selection: Set<string>, id: string) =>
    clickPermission(
      index,
      selection,
      id,
      clickedValue(checkboxState(index, id, selection)),
      grantableBy(HELD, new Set()),
    ).selection;

  it("grants only what the editor holds, and clears a mixed box it cannot fill", () => {
    const granted = click(new Set(), ORDERS);
    expect(sorted(granted)).toEqual(sorted(HELD));
    expect(checkboxState(index, ORDERS, granted)).toBe("indeterminate");

    const cleared = click(granted, ORDERS);
    expect(cleared.has(ORDERS)).toBe(false);
    expect(cleared.has(READ)).toBe(false);
  });

  it("lets the editor tick again what the saved role holds, and nothing else they lack", () => {
    const saved = new Set([REFUND]);
    expect(grantableBy(HELD, saved)(REFUND)).toBe(true);
    expect(grantableBy(HELD, new Set())(REFUND)).toBe(false);
    expect(grantableBy(null, new Set())(REFUND)).toBe(true);
  });
});

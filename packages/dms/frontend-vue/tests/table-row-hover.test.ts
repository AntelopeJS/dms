import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tv } from "tailwind-variants";
import {
  resolveRowClickAction,
  type RowClickActionOptions,
} from "../layers/dms-ui/app/utils/rowClickAction";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

const tableSource = readFileSync(
  new URL(
    "../layers/dms-ui/app/build/components/table/Table.vue",
    import.meta.url,
  ),
  "utf8",
);
const themeSource = tableSource.slice(
  tableSource.indexOf("const PANEL_MATCH_BG"),
  tableSource.indexOf("// Grid-like default"),
);
const theme = new Function("tv", `${themeSource}; return theme;`)(tv);

const HOVER_ROW = "hover:bg-elevated";
const HOVER_CELL = "group-hover:bg-elevated";

const detailsAction: CustomRowAction = {
  label: "Details",
  target: { type: "page", url: "/sends/:id" },
};
const defaultDetailsAction: CustomRowAction = {
  ...detailsAction,
  isDefault: true,
};

const rowFor = (status: string) => ({ _id: "1", status });

describe("row hover affordance", () => {
  it.each([true, false])(
    "gives the row and its pinned cells the same hover for rowClickable=%s",
    (rowClickable) => {
      const ui = theme();
      const rowHasHover = ui
        .row({ loading: false, rowClickable })
        .includes(HOVER_ROW);
      const leftHasHover = ui
        .rowCell({ pinned: "left", loading: false, rowClickable })
        .includes(HOVER_CELL);
      const rightHasHover = ui
        .rowCell({ pinned: "right", loading: false, rowClickable })
        .includes(HOVER_CELL);

      expect(rowHasHover).toBe(rowClickable);
      expect(leftHasHover).toBe(rowClickable);
      expect(rightHasHover).toBe(rowClickable);
    },
  );

  it("treats an unset loading flag like a loaded table", () => {
    const ui = theme();
    expect(ui.row({ rowClickable: true })).toContain(HOVER_ROW);
    expect(ui.rowCell({ pinned: "left", rowClickable: true })).toContain(
      HOVER_CELL,
    );
  });

  it("keeps pinned cells inert while the table is loading", () => {
    const ui = theme();
    expect(ui.row({ loading: true, rowClickable: true })).not.toContain(
      HOVER_ROW,
    );
    expect(
      ui.rowCell({ pinned: "left", loading: true, rowClickable: true }),
    ).not.toContain(HOVER_CELL);
  });

  it("never tints unpinned cells, which inherit the row background", () => {
    expect(
      theme().rowCell({ loading: false, rowClickable: true }),
    ).not.toContain(HOVER_CELL);
  });

  it("keeps the presence tint independent of the hover", () => {
    const pinned = theme().rowCell({
      pinned: "left",
      loading: false,
      rowClickable: false,
    });
    expect(pinned).toContain("group-data-[presence=true]:bg-elevated");
  });

  it("feeds the same condition to the row, its pinned cells and the rail", () => {
    expect(tableSource).toMatch(
      /uiTable\.row\(\{\s*loading,\s*rowClickable: isRowClickable\(row\.original\),/,
    );
    expect(tableSource).toMatch(
      /uiTable\.rowCell\(\{[^}]*rowClickable: isRowClickable\(row\.original\),/,
    );
    expect(tableSource).toContain("presenceRailBackground(row.original)");
  });
});

describe("resolveRowClickAction", () => {
  it("leaves a row inert when nothing can open it", () => {
    expect(resolveRowClickAction(undefined, rowFor("sent"))).toBeUndefined();
    expect(
      resolveRowClickAction({ edit: false, details: false }, rowFor("sent")),
    ).toBeUndefined();
  });

  it("prefers edit, then details", () => {
    expect(
      resolveRowClickAction({ edit: true, details: true }, rowFor("sent")),
    ).toBe("edit");
    expect(
      resolveRowClickAction({ edit: false, details: true }, rowFor("sent")),
    ).toBe("details");
  });

  it("ignores custom actions that are not flagged as the row click target", () => {
    const options: RowClickActionOptions = { custom: [detailsAction] };
    expect(resolveRowClickAction(options, rowFor("sent"))).toBeUndefined();
  });

  it("runs a flagged custom action ahead of the built-ins", () => {
    const options: RowClickActionOptions = {
      edit: true,
      details: true,
      custom: [detailsAction, defaultDetailsAction],
    };
    expect(resolveRowClickAction(options, rowFor("sent"))).toBe(
      defaultDetailsAction,
    );
  });

  it("falls back to the built-ins when the flagged action rejects the row", () => {
    const ruled: CustomRowAction = {
      ...defaultDetailsAction,
      rule: { field: "status", equals: "draft" },
    };
    const options: RowClickActionOptions = { edit: true, custom: [ruled] };
    expect(resolveRowClickAction(options, rowFor("sent"))).toBe("edit");
    expect(resolveRowClickAction(options, rowFor("draft"))).toBe(ruled);
  });

  it("honours the rules of the built-in actions", () => {
    const options: RowClickActionOptions = {
      edit: { rule: { field: "status", equals: "draft" } },
      details: true,
    };
    expect(resolveRowClickAction(options, rowFor("draft"))).toBe("edit");
    expect(resolveRowClickAction(options, rowFor("sent"))).toBe("details");
  });
});

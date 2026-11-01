import { describe, expect, it } from "vitest";
import {
  resolveRowClickAction,
  rowCustomActions,
  type RowClickActionOptions,
} from "../layers/dms-ui/app/utils/rowClickAction";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

const detailsAction: CustomRowAction = {
  label: "Details",
  target: { type: "page", url: "/sends/:id" },
};
const defaultDetailsAction: CustomRowAction = {
  ...detailsAction,
  isDefault: true,
};

const rowFor = (status: string) => ({ _id: "1", status });

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

describe("rowCustomActions", () => {
  const stopSelling: CustomRowAction = {
    id: "stop_selling",
    label: "Stop selling",
    target: { type: "api", url: "/plans/{{row._id}}/stop", method: "POST" },
    rule: { field: "isActive", equals: true },
  };
  const remove: CustomRowAction = {
    id: "delete",
    label: "Delete",
    target: { type: "api", url: "/plans/{{row._id}}", method: "DELETE" },
    rule: { field: "workspaces", equals: 0 },
  };

  it("lists the actions whose rule accepts the row, in their order", () => {
    const actions = [detailsAction, stopSelling, remove];
    expect(
      rowCustomActions(actions, { isActive: true, workspaces: 0 }),
    ).toEqual(actions);
    expect(
      rowCustomActions(actions, { isActive: false, workspaces: 2 }).map(
        (action) => action.label,
      ),
    ).toEqual(["Details"]);
  });

  it("lists nothing for a table without custom actions", () => {
    expect(rowCustomActions(undefined, {})).toEqual([]);
  });
});

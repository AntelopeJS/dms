import { describe, expect, it } from "vitest";
import { fillFormPageUrl } from "../layers/dms-ui/app/build/composables/table-view/useTableViewConfig";

const ROW = "row-1";

describe("filling a serialized form page URL", () => {
  it("substitutes the row id of a default slug", () => {
    expect(
      fillFormPageUrl("/settings/users/roles/table/:id/edit", {}, ROW),
    ).toBe("/settings/users/roles/table/row-1/edit");
  });

  it("leaves a URL without placeholder alone", () => {
    expect(fillFormPageUrl("/settings/users/roles/table/new", {})).toBe(
      "/settings/users/roles/table/new",
    );
  });

  it("substitutes the row id inside the query string of an absolute slug", () => {
    expect(
      fillFormPageUrl("/modules/automation/builder?selected=:id", {}, ROW),
    ).toBe("/modules/automation/builder?selected=row-1");
  });

  it("tells the row id apart from the id of the carrying page", () => {
    expect(
      fillFormPageUrl("/modules/workspaces/:id/:id/view", { id: "ws-1" }, ROW),
    ).toBe("/modules/workspaces/ws-1/row-1/view");
  });

  it("tells the ids apart across the key segment of the table view", () => {
    expect(
      fillFormPageUrl(
        "/modules/workspaces/:id/invoiceTable/:id/view",
        { id: "ws-1" },
        ROW,
      ),
    ).toBe("/modules/workspaces/ws-1/invoiceTable/row-1/view");
  });

  it("fills the params of the carrying page when the form takes no row id", () => {
    expect(fillFormPageUrl("/modules/workspaces/:id/new", { id: "ws-1" })).toBe(
      "/modules/workspaces/ws-1/new",
    );
  });

  it("matches a route param on its whole name", () => {
    expect(
      fillFormPageUrl(
        "/projects/:project/:projectRole/:id/view",
        {
          project: "p-1",
          projectRole: "owner",
        },
        ROW,
      ),
    ).toBe("/projects/p-1/owner/row-1/view");
  });
});

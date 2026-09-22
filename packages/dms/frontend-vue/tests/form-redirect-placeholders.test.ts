import { describe, expect, it } from "vitest";
import { extractRouteParams } from "../layers/dms-layout/app/composables/page/useSiteLayout";
import { resolveFormSuccessTarget } from "../layers/dms-ui/app/build/composables/table-view/registerDefaultFunctions";

// The redirect a page-mode form of a table view registered below
// `/workspaces/:id` sends on submit, as the TableView factory generates it for
// each form page route.
const EDIT_PATTERN = "/workspaces/:id/invoiceTable/:id/edit";
const NEW_PATTERN = "/workspaces/:id/invoiceTable/new";
const EDIT_REDIRECT = { url: "/workspaces/{{params.id:1}}" };
const NEW_REDIRECT = { url: "/workspaces/{{params.id}}" };

const routeOf = (
  pattern: string,
  path: string,
  query: Record<string, string> = {},
) => ({ params: extractRouteParams(pattern, path)!, query });

describe("page-mode form redirect", () => {
  it("sends the edit form back to the page, not to the row", () => {
    expect(
      resolveFormSuccessTarget(
        EDIT_REDIRECT,
        routeOf(EDIT_PATTERN, "/workspaces/ws-42/invoiceTable/inv-7/edit"),
      ),
    ).toEqual({ path: "/workspaces/ws-42" });
  });

  it("sends the new form back to the page", () => {
    expect(
      resolveFormSuccessTarget(
        NEW_REDIRECT,
        routeOf(NEW_PATTERN, "/workspaces/ws-42/invoiceTable/new"),
      ),
    ).toEqual({ path: "/workspaces/ws-42" });
  });

  it("carries back the declared query params only", () => {
    expect(
      resolveFormSuccessTarget(
        { ...EDIT_REDIRECT, preserveQuery: ["status", "missing"] },
        routeOf(EDIT_PATTERN, "/workspaces/ws-42/invoiceTable/inv-7/edit", {
          status: "paid",
          other: "x",
        }),
      ),
    ).toEqual({ path: "/workspaces/ws-42", query: { status: "paid" } });
  });

  it("leaves the slug of a page without route parameter as is", () => {
    const route = routeOf(
      "/invoices/invoiceTable/:id/edit",
      "/invoices/invoiceTable/inv-7/edit",
      {
        status: "paid",
      },
    );

    expect(resolveFormSuccessTarget({ url: "/invoices" }, route)).toEqual({
      path: "/invoices",
    });
    expect(
      resolveFormSuccessTarget(
        { url: "/invoices", preserveQuery: ["status"] },
        route,
      ),
    ).toEqual({ path: "/invoices", query: { status: "paid" } });
  });
});

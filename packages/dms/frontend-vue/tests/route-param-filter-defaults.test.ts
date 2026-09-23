import { describe, expect, it } from "vitest";
import { extractRouteParams } from "../layers/dms-layout/app/composables/page/useSiteLayout";
import {
  replaceUrlVariables,
  resolveSubmitDefaults,
} from "../layers/dms-ui/app/composables/form/useForm";

// The forms of a table view filtered by `routeParamFilters: { id: { field:
// "_instance" } }`, registered below a page whose own slug is `:id`. The tokens
// are what the TableView factory generates for each form page route.
const EDIT_PATTERN = "/workspaces/:id/invoiceTable/:id/edit";
const NEW_PATTERN = "/workspaces/:id/invoiceTable/new";
const EDIT_DEFAULTS = { _instance: "{{params.id:1}}" };
const NEW_DEFAULTS = { _instance: "{{params.id}}" };
const EDIT_SUBMIT_URL = "/api/invoices/edit?id={{params.id}}";

const contextOf = (pattern: string, path: string) => ({
  routeParams: extractRouteParams(pattern, path)!,
  routeQuery: {},
});

describe("route param filter defaults on a nested form page", () => {
  it("submits the page id in the filtered field, the row id in the URL", () => {
    const context = contextOf(
      EDIT_PATTERN,
      "/workspaces/ws-42/invoiceTable/inv-7/edit",
    );

    expect(resolveSubmitDefaults(EDIT_DEFAULTS, context)).toEqual({
      _instance: "ws-42",
    });
    expect(replaceUrlVariables(EDIT_SUBMIT_URL, context)).toBe(
      "/api/invoices/edit?id=inv-7",
    );
  });

  it("submits the page id from the new form, whose route has one :id", () => {
    expect(
      resolveSubmitDefaults(
        NEW_DEFAULTS,
        contextOf(NEW_PATTERN, "/workspaces/ws-42/invoiceTable/new"),
      ),
    ).toEqual({ _instance: "ws-42" });
  });

  // A form reached at an absolute URL does not carry the page's parameters:
  // the default is dropped rather than submitted as a literal token.
  it("drops a default no parameter of the route answers", () => {
    const context = contextOf(
      "/modules/automation/builder/:id",
      "/modules/automation/builder/p-1",
    );

    expect(resolveSubmitDefaults(EDIT_DEFAULTS, context)).toBe(undefined);
    expect(
      resolveSubmitDefaults({ ...EDIT_DEFAULTS, status: "draft" }, context),
    ).toEqual({ status: "draft" });
  });
});

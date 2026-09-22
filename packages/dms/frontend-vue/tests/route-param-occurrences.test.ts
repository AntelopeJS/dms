import { describe, expect, it } from "vitest";
import { extractRouteParams } from "../layers/dms-layout/app/composables/page/useSiteLayout";
import { replaceUrlVariables } from "../layers/dms-ui/app/composables/form/useForm";

// A page-mode form sub-page under a page whose own slug is `:id`: the carrying
// page contributes one `:id` and the form slug appends another.
const NESTED_FORM_PATTERN = "/workspaces/:id/invoiceTable/:id/edit";
const NESTED_FORM_PATH = "/workspaces/ws-1/invoiceTable/row-7/edit";

describe("extractRouteParams", () => {
  it("keeps a single placeholder under its bare name and nothing else", () => {
    expect(
      extractRouteParams("/customers/:id/edit", "/customers/c-1/edit"),
    ).toEqual({ id: "c-1" });
  });

  it("keeps distinct placeholders under their own names and nothing else", () => {
    expect(
      extractRouteParams(
        "/projects/:project/members/:id/view",
        "/projects/p-1/members/m-2/view",
      ),
    ).toEqual({ project: "p-1", id: "m-2" });
  });

  it("reaches both values when one name occurs twice", () => {
    expect(extractRouteParams(NESTED_FORM_PATTERN, NESTED_FORM_PATH)).toEqual({
      id: "row-7",
      "id:1": "ws-1",
      "id:2": "row-7",
    });
  });

  it("numbers every occurrence of a name repeated more than twice", () => {
    expect(
      extractRouteParams(
        "/a/:id/b/:id/c/:id/view",
        "/a/one/b/two/c/three/view",
      ),
    ).toEqual({
      id: "three",
      "id:1": "one",
      "id:2": "two",
      "id:3": "three",
    });
  });

  it("indexes only the repeated name, leaving its neighbours untouched", () => {
    expect(
      extractRouteParams(
        "/workspaces/:id/:tenant/invoiceTable/:id/edit",
        "/workspaces/ws-1/t-9/invoiceTable/row-7/edit",
      ),
    ).toEqual({
      id: "row-7",
      "id:1": "ws-1",
      "id:2": "row-7",
      tenant: "t-9",
    });
  });

  it("still refuses a path the pattern does not match", () => {
    expect(extractRouteParams(NESTED_FORM_PATTERN, "/workspaces/ws-1")).toBe(
      null,
    );
  });
});

describe("form URL variables on a repeated placeholder", () => {
  const context = {
    routeParams: extractRouteParams(NESTED_FORM_PATTERN, NESTED_FORM_PATH)!,
    routeQuery: {},
  };

  // What the TableView factory generates for the edit form: the bare name has
  // to stay the row id, on a nested route as on a flat one.
  it("resolves the bare name to the row id", () => {
    expect(
      replaceUrlVariables("/invoices/edit?id={{params.id}}", context),
    ).toBe("/invoices/edit?id=row-7");
  });

  it("resolves an indexed name to the id of the carrying page", () => {
    expect(
      replaceUrlVariables(
        "/workspaces/{{params.id:1}}/invoices/{{params.id}}",
        context,
      ),
    ).toBe("/workspaces/ws-1/invoices/row-7");
  });

  it("leaves an indexed token that no occurrence answers alone", () => {
    expect(replaceUrlVariables("/invoices/{{params.id:3}}", context)).toBe(
      "/invoices/{{params.id:3}}",
    );
  });

  it("resolves the bare name on a single-placeholder route as before", () => {
    expect(
      replaceUrlVariables("/customers/edit?id={{params.id}}", {
        routeParams: extractRouteParams(
          "/customers/:id/edit",
          "/customers/c-1/edit",
        )!,
        routeQuery: {},
      }),
    ).toBe("/customers/edit?id=c-1");
  });
});

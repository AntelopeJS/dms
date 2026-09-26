import { describe, expect, it } from "vitest";
import { resolveSubmitTarget } from "../layers/dms-ui/app/composables/form/useForm";

const page = { routeParams: { id: "42" }, routeQuery: { id: "7" } };

describe("resolveSubmitTarget", () => {
  it("sends a submit where its URL points, tokens filled in", () => {
    expect(resolveSubmitTarget("/api/ticket/edit?id={{query.id}}", page)).toEqual(
      { url: "/api/ticket/edit?id=7" },
    );
    expect(resolveSubmitTarget("/api/ticket/edit?id={{params.id}}", page)).toEqual(
      { url: "/api/ticket/edit?id=42" },
    );
  });

  it("has nowhere to send a read-only form's values", () => {
    expect(resolveSubmitTarget(undefined, page)).toEqual({ missing: "url" });
    expect(resolveSubmitTarget("", page)).toEqual({ missing: "url" });
  });

  it("refuses a URL naming a row the page does not carry", () => {
    expect(
      resolveSubmitTarget("/api/ticket/edit?id={{query.id}}", {
        routeQuery: {},
      }),
    ).toEqual({ missing: "token" });
  });
});

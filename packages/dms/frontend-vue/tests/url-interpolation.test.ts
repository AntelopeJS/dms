import { describe, expect, it } from "vitest";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";

describe("interpolateUrl", () => {
  it("fills row fields into the URL, encoded", () => {
    expect(
      interpolateUrl("/items/{{row._id}}/tag/{{row.name}}", { _id: "a1", name: "a b/c" }),
    ).toBe("/items/a1/tag/a%20b%2Fc");
  });

  it("keeps the colon of a tenant-scoped id readable", () => {
    expect(
      interpolateUrl("/members/{{row._id}}/owner", { _id: "default:29fd-11" }),
    ).toBe("/members/default:29fd-11/owner");
  });

  it("leaves a missing field empty", () => {
    expect(interpolateUrl("/items/{{row.missing}}", {})).toBe("/items/");
  });

  it("keeps web and mail links", () => {
    expect(interpolateUrl("https://acme.dev/{{row.slug}}", { slug: "a" })).toBe(
      "https://acme.dev/a",
    );
    expect(interpolateUrl("mailto:{{row.email}}", { email: "a@b.c" })).toBe(
      "mailto:a%40b.c",
    );
  });

  it("refuses a scheme the row data brings in", () => {
    for (const site of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
    ]) {
      expect(interpolateUrl("{{row.site}}", { site })).toBe("");
    }
  });
});

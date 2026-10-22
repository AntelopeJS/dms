import { describe, expect, it } from "vitest";
import {
  interpolateRowText,
  interpolateUrl,
} from "../layers/dms-core/app/utils/url-interpolation";

describe("interpolateUrl", () => {
  it("fills row fields into the URL, encoded", () => {
    expect(
      interpolateUrl("/items/{{row._id}}/tag/{{row.name}}", {
        _id: "a1",
        name: "a b/c",
      }),
    ).toBe("/items/a1/tag/a%20b%2Fc");
  });

  it("keeps the colon of a tenant-scoped id readable", () => {
    expect(
      interpolateUrl("/members/{{row._id}}/owner", { _id: "default:29fd-11" }),
    ).toBe("/members/default:29fd-11/owner");
  });

  it("names a relation field listed as the related row by that row's id", () => {
    const row = {
      _id: "o1",
      customer: { _id: "cust-025", name: "Ada Lovelace" },
      site: { id: "site-39", label: "Liège" },
      tags: [{ _id: "t1" }, { _id: "t2" }],
      owner: { name: "no id" },
    };
    expect(interpolateUrl("/customers/{{row.customer}}", row)).toBe(
      "/customers/cust-025",
    );
    expect(interpolateUrl("/sites/{{row.site}}?o={{row._id}}", row)).toBe(
      "/sites/site-39?o=o1",
    );
    expect(interpolateUrl("/c/{{row.customer.name}}", row)).toBe(
      "/c/Ada%20Lovelace",
    );
    expect(interpolateUrl("/tags?ids={{row.tags}}", row)).toBe(
      "/tags?ids=t1%2Ct2",
    );
    expect(interpolateUrl("/owners/{{row.owner}}", row)).toBe("/owners/");
    expect(interpolateRowText("{{row.customer}}.pdf", row)).toBe(
      "cust-025.pdf",
    );
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

  it("takes a field forming the whole URL as it is", () => {
    const url = "https://pay.stripe.com/invoice/acct_1/x/pdf?s=ap";
    expect(interpolateUrl("{{row.invoiceUrl}}", { invoiceUrl: url })).toBe(url);
    expect(
      interpolateUrl(" {{ row.links.self }} ", { links: { self: "/a/b?c=d" } }),
    ).toBe("/a/b?c=d");
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

import { describe, expect, it } from "vitest";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";

describe("interpolateUrl", () => {
  it("fills row fields into the URL, encoded", () => {
    expect(
      interpolateUrl("/items/{_id}/tag/{name}", { _id: "a1", name: "a b/c" }),
    ).toBe("/items/a1/tag/a%20b%2Fc");
  });

  it("keeps the colon of a tenant-scoped id readable", () => {
    expect(
      interpolateUrl("/members/{_id}/owner", { _id: "default:29fd-11" }),
    ).toBe("/members/default:29fd-11/owner");
  });

  it("leaves a missing field empty", () => {
    expect(interpolateUrl("/items/{missing}", {})).toBe("/items/");
  });
});

import { describe, expect, it } from "vitest";
import { pageSizeOptions } from "../layers/dms-ui/app/build/composables/table/utils/pageSizeOptions";

describe("Table page size picker", () => {
  it("offers the standard sizes", () => {
    expect(pageSizeOptions(undefined, 10)).toEqual([10, 25, 50]);
  });

  it("adds the table's own default when it is not a standard size", () => {
    expect(pageSizeOptions(20, 20)).toEqual([10, 20, 25, 50]);
  });

  it("keeps the table's default once the user picked another size", () => {
    expect(pageSizeOptions(20, 50)).toEqual([10, 20, 25, 50]);
  });

  it("keeps a stored size outside the list", () => {
    expect(pageSizeOptions(undefined, 7)).toEqual([7, 10, 25, 50]);
  });
});

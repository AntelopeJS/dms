import { describe, expect, it } from "vitest";
import { rowIdOf } from "../layers/dms-ui/app/build/composables/table/utils/rowId";

describe("rowIdOf", () => {
  it("reads a string id as it is", () => {
    expect(rowIdOf({ id: "inv-1" }, "id")).toBe("inv-1");
  });

  it("reads a nested id by its path", () => {
    expect(rowIdOf({ meta: { key: "a-7" } }, "meta.key")).toBe("a-7");
  });

  it("reads a numeric id as the string every row action takes", () => {
    expect(rowIdOf({ id: 42 }, "id")).toBe("42");
  });
});

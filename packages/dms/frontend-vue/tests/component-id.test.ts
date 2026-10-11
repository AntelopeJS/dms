import { describe, expect, it } from "vitest";
import {
  childComponentId,
  siblingComponentId,
} from "../layers/dms-ui/app/utils/componentId";

describe("siblingComponentId", () => {
  it("names a top-level block's neighbour by its key", () => {
    expect(siblingComponentId("preview", "form")).toBe("form");
  });

  it("names a nested block's neighbour under the same parent", () => {
    const row = childComponentId("editor", "row");
    expect(siblingComponentId(childComponentId(row, "preview"), "form")).toBe(
      "editor-child-row-child-form",
    );
  });
});

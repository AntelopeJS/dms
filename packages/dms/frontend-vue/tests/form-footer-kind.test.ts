import { describe, expect, it } from "vitest";
import {
  actionFormShowsButtons,
  formSaveMode,
} from "../layers/dms-ui/app/composables/form/formFooter";

describe("formSaveMode", () => {
  it("saves with the bar by default, and for an instant form until it ships", () => {
    expect(formSaveMode(undefined)).toBe("bar");
    expect(formSaveMode("instant")).toBe("bar");
  });

  it("keeps the footer and no buttons as asked", () => {
    expect(formSaveMode("footer")).toBe("footer");
    expect(formSaveMode("none")).toBe("none");
  });
});

describe("actionFormShowsButtons", () => {
  it("hides them until a value changes, pre-filled or not", () => {
    expect(actionFormShowsButtons(false, true)).toBe(false);
    expect(actionFormShowsButtons(true, true)).toBe(true);
  });

  it("shows them on a form nothing in which can be changed", () => {
    expect(actionFormShowsButtons(false, false)).toBe(true);
  });
});

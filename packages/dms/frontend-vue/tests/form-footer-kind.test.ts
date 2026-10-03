import { describe, expect, it } from "vitest";
import {
  actionFormShowsButtons,
  formFooterKind,
} from "../layers/dms-ui/app/composables/form/formFooter";

describe("formFooterKind", () => {
  it("keeps a table view's forms as record forms: drawer, modal, form page", () => {
    expect(formFooterKind({ inContainer: true })).toBe("record");
    expect(formFooterKind({ inContainer: false, cancellable: true })).toBe(
      "record",
    );
  });

  it("makes a form placed on a page an action form", () => {
    expect(formFooterKind({ inContainer: false })).toBe("action");
    expect(formFooterKind({ inContainer: false, cancellable: false })).toBe(
      "action",
    );
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

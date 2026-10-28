import { describe, expect, it } from "vitest";
import {
  formSaveMode,
  type SaveBarContext,
  saveBarState,
} from "../layers/dms-ui/app/entries/composables/form/formFooter";

describe("formSaveMode", () => {
  it("saves with the bar by default", () => {
    expect(formSaveMode(undefined)).toBe("bar");
  });

  it("saves as it goes when instant, unless it is an action form", () => {
    expect(formSaveMode("instant")).toBe("instant");
    expect(formSaveMode("instant", "record")).toBe("instant");
    expect(formSaveMode("instant", "action")).toBe("bar");
  });

  it("keeps the footer and no buttons as asked", () => {
    expect(formSaveMode("footer")).toBe("footer");
    expect(formSaveMode("none")).toBe("none");
  });
});

const context = (overrides: Partial<SaveBarContext>): SaveBarContext => ({
  kind: "record",
  dirty: false,
  cancellable: false,
  resettable: true,
  ...overrides,
});

describe("saveBarState of a record form", () => {
  it("says what is unsaved, with Discard and Save, once a value changed", () => {
    expect(saveBarState(context({ dirty: true }))).toEqual({
      showsStatus: true,
      secondary: "discard",
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("keeps Cancel beside Save once changed, when it can be left", () => {
    expect(saveBarState(context({ dirty: true, cancellable: true }))).toEqual({
      showsStatus: true,
      secondary: "cancel",
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("hides while clean, even with somewhere to go back to", () => {
    expect(saveBarState(context({ cancellable: true })).isHidden).toBe(true);
    expect(
      saveBarState(context({ cancellable: true, closable: true })).isHidden,
    ).toBe(true);
    expect(saveBarState(context({})).isHidden).toBe(true);
  });

  it("offers Cancel beside Save once changed, in a drawer too", () => {
    expect(
      saveBarState(context({ cancellable: true, closable: true, dirty: true })),
    ).toMatchObject({
      showsStatus: true,
      secondary: "cancel",
      showsSubmit: true,
      isHidden: false,
    });
  });
});

describe("saveBarState of a create form", () => {
  const create = (overrides: Partial<SaveBarContext>) =>
    saveBarState(context({ kind: "create", ...overrides }));

  it("can be saved as it opened: a duplicate needs no change first", () => {
    expect(create({ cancellable: true })).toEqual({
      showsStatus: false,
      secondary: "cancel",
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("lists no unsaved changes once filled, Cancel still beside Save", () => {
    expect(create({ cancellable: true, dirty: true })).toMatchObject({
      showsStatus: false,
      secondary: "cancel",
      showsSubmit: true,
    });
  });

  it("offers its submit alone in a drawer or a modal until filled", () => {
    const opened = create({ cancellable: true, closable: true });
    expect(opened.secondary).toBeUndefined();
    expect(opened).toMatchObject({ showsSubmit: true, isHidden: false });
    expect(
      create({ cancellable: true, closable: true, dirty: true }).secondary,
    ).toBe("cancel");
  });

  it("offers Discard once filled with nowhere to go back to", () => {
    expect(create({}).secondary).toBeUndefined();
    expect(create({ dirty: true }).secondary).toBe("discard");
    expect(create({}).isHidden).toBe(false);
  });
});

describe("saveBarState of an action form", () => {
  const action = (overrides: Partial<SaveBarContext>) =>
    saveBarState(context({ kind: "action", ...overrides }));

  it("shows Reset and its submit once a value changed, never a status", () => {
    expect(action({ dirty: true })).toEqual({
      showsStatus: false,
      secondary: "discard",
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("shows its submit alone, ready, on a page while untouched", () => {
    expect(action({})).toEqual({
      showsStatus: false,
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("offers no Cancel in a drawer or a modal: their close button does it", () => {
    expect(action({ cancellable: true, closable: true })).toEqual({
      showsStatus: false,
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("offers Cancel beside its ready submit on a page it can leave", () => {
    expect(action({ cancellable: true })).toEqual({
      showsStatus: false,
      secondary: "cancel",
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("shows its submit alone, ready, when nothing in it can be changed", () => {
    const bar = action({ resettable: false, dirty: true });
    expect(bar.secondary).toBeUndefined();
    expect(bar).toMatchObject({
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formSaveMode,
  type SaveBarContext,
  saveBarState,
} from "../layers/dms-ui/app/build/composables/form/formFooter";

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
    expect(
      saveBarState(context({ dirty: true, cancellable: true })),
    ).toEqual({
      showsStatus: true,
      secondary: "cancel",
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("offers Cancel alone while clean, when it has somewhere to go back to", () => {
    expect(saveBarState(context({ cancellable: true }))).toMatchObject({
      showsStatus: false,
      secondary: "cancel",
      showsSubmit: false,
      isHidden: false,
    });
  });

  it("hides, keeping its place, with nothing to offer", () => {
    expect(saveBarState(context({})).isHidden).toBe(true);
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
    // A pre-filled form sends its defaults as they are.
    expect(action({})).toEqual({
      showsStatus: false,
      showsSubmit: true,
      isSubmitHeld: false,
      isHidden: false,
    });
  });

  it("offers Cancel beside its ready submit in a drawer or a modal", () => {
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

describe("Form.vue's Cancel", () => {
  const source = readFileSync(
    new URL("../layers/dms-ui/app/components/form/Form.vue", import.meta.url),
    "utf8",
  );

  it("drops the changes before it leaves, so leaving asks nothing", () => {
    const body = /function cancelForm\(\): void \{\s*([^\r\n]*)/.exec(source);
    expect(body?.[1]).toBe("if (isDirty.value) discardChanges();");
  });
});

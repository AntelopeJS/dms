/**
 * What a form edits, which decides its buttons (interface-dms `FormKind`).
 *
 * - `record` (default): a record, a settings page, a table view's form. It
 *   keeps its values once saved; Cancel while there is nothing to save when
 *   it has somewhere to go back to, then "Unsaved changes" with Save and,
 *   beside it, Cancel again (discard and leave) or, with nowhere to go back
 *   to, Discard.
 * - `action`: a form that does something each time (send a notification,
 *   invite someone, run a job). Its own submit label, always ready: what it
 *   holds untouched, its defaults included, is a payload too. Beside it,
 *   Reset once a value changed, Cancel before that in a drawer or a modal.
 *   It empties after a successful submit.
 */
export type FormKind = "record" | "action";

/** How a form offers to save (interface-dms `FormSaveMode`). */
export type FormSaveMode = "bar" | "footer" | "none" | "instant";

/**
 * The way a form saves: `bar` unless it says otherwise. An `action` form
 * (send, invite, run) is sent on purpose, so it never saves as it goes.
 */
export function formSaveMode(
  mode: FormSaveMode | undefined,
  kind?: FormKind,
): FormSaveMode {
  if (mode === "instant" && kind === "action") return "bar";
  return mode ?? "bar";
}

/** What a form's save bar knows of its form. */
export interface SaveBarContext {
  kind: FormKind;
  /** Something changed since the form loaded. */
  dirty: boolean;
  /** The form has somewhere to go back to: its drawer or modal, `backTo`. */
  cancellable: boolean;
  /** Something in the form can be changed, hence reset. */
  resettable: boolean;
  /**
   * A `record` form that creates a row: a new one, or a duplicate seeded by
   * the row it copies.
   */
  creates?: boolean;
}

/**
 * The button beside the submit: Discard / Reset (values back, the form
 * stays), or Cancel (values back, the form is left).
 */
export type SaveBarSecondary = "discard" | "cancel";

/** What a form's save bar shows. */
export interface SaveBarState {
  /** "Unsaved changes", before the buttons. */
  showsStatus: boolean;
  secondary?: SaveBarSecondary;
  showsSubmit: boolean;
  /** The submit shows but waits for a change. */
  isSubmitHeld: boolean;
  /**
   * Nothing to offer: the bar hides. The floating bar takes no space then
   * (it overlays the form), a band keeps its place; either way its showing
   * up never moves the content above it.
   */
  isHidden: boolean;
}

const HIDDEN_BAR: SaveBarState = {
  showsStatus: true,
  secondary: "discard",
  showsSubmit: true,
  isSubmitHeld: false,
  isHidden: true,
};

/**
 * A record form's bar: "Unsaved changes" and Save once a value changed, Cancel
 * before that when it has somewhere to go back to. Beside Save, a form with
 * somewhere to go back to keeps Cancel, which drops the changes and leaves,
 * the same as before any change: one click, never a reverted form left open.
 * A form with nowhere to go back to offers Discard.
 */
function recordSaveBar(context: SaveBarContext): SaveBarState {
  if (context.creates) return createSaveBar(context);
  if (context.dirty) {
    return {
      ...HIDDEN_BAR,
      secondary: context.cancellable ? "cancel" : "discard",
      isHidden: false,
    };
  }
  if (!context.cancellable) return HIDDEN_BAR;
  return {
    showsStatus: false,
    secondary: "cancel",
    showsSubmit: false,
    isSubmitHeld: false,
    isHidden: false,
  };
}

/**
 * A create form's bar: its submit from the start, since a duplicate (or a
 * row its defaults fill) is saved as it is, with no "Unsaved changes" list,
 * since all it holds is new. Beside it, Cancel when it has somewhere to go
 * back to, Discard once a value changed otherwise.
 */
function createSaveBar(context: SaveBarContext): SaveBarState {
  const bar: SaveBarState = {
    showsStatus: false,
    showsSubmit: true,
    isSubmitHeld: false,
    isHidden: false,
  };
  if (context.cancellable) return { ...bar, secondary: "cancel" };
  if (context.dirty) return { ...bar, secondary: "discard" };
  return bar;
}

/**
 * An action form's bar: its submit, never held, so a pre-filled form sends as
 * it is. Beside it, Reset once a value changed; before that, Cancel in a
 * drawer or a modal, its only way out. A form nothing in which can be changed
 * has nothing to reset.
 */
function actionSaveBar(context: SaveBarContext): SaveBarState {
  const bar: SaveBarState = {
    showsStatus: false,
    showsSubmit: true,
    isSubmitHeld: false,
    isHidden: false,
  };
  if (context.dirty && context.resettable) {
    return { ...bar, secondary: "discard" };
  }
  if (!context.dirty && context.cancellable) {
    return { ...bar, secondary: "cancel" };
  }
  return bar;
}

const SAVE_BARS: Record<FormKind, (context: SaveBarContext) => SaveBarState> = {
  record: recordSaveBar,
  action: actionSaveBar,
};

/** What a form's save bar shows, from its kind and its state. */
export function saveBarState(context: SaveBarContext): SaveBarState {
  return SAVE_BARS[context.kind](context);
}

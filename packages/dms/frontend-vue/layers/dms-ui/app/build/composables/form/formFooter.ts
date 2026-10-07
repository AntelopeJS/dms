/**
 * What a form edits, which decides its buttons (interface-dms `FormKind`).
 *
 * - `record` (default): a record, a settings page, a table view's form. It
 *   keeps its values once saved; Cancel while there is nothing to save when
 *   it has somewhere to go back to, then "Unsaved changes" with Discard and
 *   Save.
 * - `action`: a form that does something each time (send a notification,
 *   invite someone, run a job). Reset and the form's own submit label once a
 *   value changed; untouched — pre-filled or not —, no buttons on a page, and
 *   Cancel beside a held submit in a drawer or a modal. It empties after a
 *   successful submit.
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
}

/** The button beside the submit: Discard / Reset, or Cancel. */
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
   * Nothing to offer: the bar keeps its place, invisible, so its showing up
   * never moves the content around it.
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
 * A record form's bar: "Unsaved changes" with Discard and Save once a value
 * changed, Cancel before that when it has somewhere to go back to.
 */
function recordSaveBar(context: SaveBarContext): SaveBarState {
  if (context.dirty) return { ...HIDDEN_BAR, isHidden: false };
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
 * An action form's bar: Reset and its submit once a value changed. Before
 * that, a form in a drawer or a modal offers Cancel beside its held submit —
 * the modal's only way out and the proof it sends something —, a page form
 * nothing; a form nothing in which can be changed, its submit alone.
 */
function actionSaveBar(context: SaveBarContext): SaveBarState {
  const bar = { showsStatus: false, showsSubmit: true, isHidden: false };
  if (!context.resettable) return { ...bar, isSubmitHeld: false };
  if (context.dirty) {
    return { ...bar, secondary: "discard", isSubmitHeld: false };
  }
  if (!context.cancellable) {
    return { ...HIDDEN_BAR, showsStatus: false };
  }
  return { ...bar, secondary: "cancel", isSubmitHeld: true };
}

const SAVE_BARS: Record<FormKind, (context: SaveBarContext) => SaveBarState> = {
  record: recordSaveBar,
  action: actionSaveBar,
};

/** What a form's save bar shows, from its kind and its state. */
export function saveBarState(context: SaveBarContext): SaveBarState {
  return SAVE_BARS[context.kind](context);
}

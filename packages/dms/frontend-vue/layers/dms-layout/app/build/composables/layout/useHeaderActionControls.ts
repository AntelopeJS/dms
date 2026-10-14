import type { HeaderAction } from "../../../composables/useHeaderActions";
import {
  isSidePanelOpen,
  toggleSidePanel,
  useSidePanelPreferences,
} from "./sidePanelState";

/** @internal */
export interface HeaderActionControls {
  /** Whether the action is a toggle, whose button reports a pressed state. */
  isToggle: (action: HeaderAction) => boolean;
  /** Whether the toggle is on: its side panel is open, or `isActive()` says so. */
  isActive: (action: HeaderAction) => boolean;
  /** Toggles the action's side panel, or runs its `onSelect`. */
  select: (action: HeaderAction) => void;
}

const ACTION_CALLABLES = ["onSelect", "isVisible", "isActive"] as const;

/**
 * Whether the action is plain data, which a universal plugin registers on the
 * server and the client alike, so the server markup holds its button. One
 * carrying a callable belongs in a `.client` plugin: the server never drew
 * it, and the header adds it once mounted rather than during hydration.
 *
 * @internal
 */
export function isPlainDataHeaderAction(action: HeaderAction): boolean {
  return ACTION_CALLABLES.every((key) => typeof action[key] !== "function");
}

/**
 * How the header reads and runs any {@link HeaderAction}: an action linked to
 * a side panel gets its state and its click from the DMS, any other one from
 * its own callables.
 *
 * @internal
 */
export function useHeaderActionControls(): HeaderActionControls {
  const preferences = useSidePanelPreferences();

  function isToggle(action: HeaderAction): boolean {
    return (
      typeof action.sidePanelId === "string" ||
      typeof action.isActive === "function"
    );
  }

  function isActive(action: HeaderAction): boolean {
    if (typeof action.sidePanelId === "string") {
      return isSidePanelOpen(preferences, action.sidePanelId);
    }
    return typeof action.isActive === "function" && action.isActive();
  }

  function select(action: HeaderAction): void {
    if (typeof action.sidePanelId === "string") {
      toggleSidePanel(preferences, action.sidePanelId);
      return;
    }
    action.onSelect?.();
  }

  return { isToggle, isActive, select };
}

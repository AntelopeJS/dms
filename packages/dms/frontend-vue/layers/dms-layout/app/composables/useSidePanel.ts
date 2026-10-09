import {
  isSidePanelOpen,
  setOpenSidePanel,
  toggleSidePanel,
  useSidePanelPreferences,
} from "../build/composables/layout/sidePanelState";

/** The open state of one side panel, and the actions that change it. */
export interface SidePanelControls {
  /** Whether this panel is the open one. */
  isOpen: Readonly<Ref<boolean>>;
  /** Opens this panel, closing the one that was open, if any. */
  open: () => void;
  /** Closes this panel; does nothing when another one is open. */
  close: () => void;
  /** Opens this panel when it is closed, closes it when it is open. */
  toggle: () => void;
}

/**
 * Opens and closes the side panel registered under `id` (see
 * {@link registerSidePanel}). The DMS owns the state: one panel is open at a
 * time, so opening one closes the other, and which one is open is remembered
 * in a cookie, so the server renders it open on the next visit. Every caller
 * of the same `id` shares the state, whatever component or plugin it runs in.
 */
export function useSidePanel(id: string): SidePanelControls {
  const preferences = useSidePanelPreferences();
  const isOpen = computed(() => isSidePanelOpen(preferences, id));

  function close(): void {
    if (isOpen.value) setOpenSidePanel(preferences, null);
  }

  return {
    isOpen,
    open: () => setOpenSidePanel(preferences, id),
    close,
    toggle: () => toggleSidePanel(preferences, id),
  };
}

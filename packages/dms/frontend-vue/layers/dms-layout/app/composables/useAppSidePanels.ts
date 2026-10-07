/**
 * A panel docked on the right of the dashboard. Unlike a free overlay (see
 * {@link useAppOverlay}), the DMS owns the placement: from `lg` the panel sits
 * next to the page, which shrinks to make room, behind a resize handle whose
 * width is remembered per panel; below `lg` it slides over the page as a sheet
 * above a backdrop. The module only declares its component and when it is open.
 *
 * Only one side panel shows at a time: the one opened last. A panel opened
 * while another is showing takes its place; closing it brings back the one it
 * covered, if that one is still open.
 *
 * Because a panel carries callables (`isOpen`, `onClose`), it must be
 * registered from CLIENT context (a `.client` plugin or component setup):
 * function values are not part of the SSR payload, so a server-side
 * registration would arrive on the client stripped. `useAppSidePanels`
 * defensively drops such entries, so a stray server-side registration degrades
 * to "panel not shown" rather than a runtime crash.
 */
export interface SidePanel {
  /** Unique key: dedup on `register` (upsert) and target of `unregister`. */
  id: string;
  /**
   * Name of a global component rendered inside the panel. It fills the panel's
   * height and scrolls its own content.
   */
  component: string;
  /**
   * Whether the panel is open. Evaluated inside a `computed`, so the panel
   * follows any reactive state read here.
   */
  isOpen: () => boolean;
  /**
   * Asks the module to close the panel: called when the user dismisses the
   * small-screen sheet (backdrop click or Escape). Without it, the sheet only
   * closes when `isOpen` turns false.
   */
  onClose?: () => void;
  /**
   * Accessible name of the panel landmark. Resolved through the DMS i18n
   * convention: a plain literal, or an i18n key when prefixed with "$".
   */
  ariaLabel?: string;
  /** Width in px before the user resizes the panel. Defaults to `440`. */
  defaultWidth?: number;
  /** Narrowest width in px the resize handle allows. Defaults to `320`. */
  minWidth?: number;
  /** Widest width in px the resize handle allows. Defaults to `720`. */
  maxWidth?: number;
}

/** The width bounds of a side panel, defaults applied. */
export interface SidePanelWidthBounds {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

interface UseAppSidePanelsReturn {
  panels: ComputedRef<SidePanel[]>;
  openPanels: ComputedRef<SidePanel[]>;
}

const SIDE_PANELS_STATE_KEY = "dms:side-panels";
const DEFAULT_SIDE_PANEL_WIDTH = 440;
const DEFAULT_SIDE_PANEL_MIN_WIDTH = 320;
const DEFAULT_SIDE_PANEL_MAX_WIDTH = 720;

function useSidePanelState() {
  return useDmsState<SidePanel[]>(SIDE_PANELS_STATE_KEY, () => []);
}

function isPanelRenderable(panel: SidePanel): boolean {
  return (
    typeof panel.isOpen === "function" && typeof panel.component === "string"
  );
}

function isPanelOpen(panel: SidePanel): boolean {
  try {
    return panel.isOpen();
  } catch (error) {
    console.error(`[side-panels] panel "${panel.id}" failed to report`, error);
    return false;
  }
}

/**
 * Registers a {@link SidePanel}, replacing any panel registered under the same
 * `id`. Call it from client context, inside the DMS app.
 */
export function registerSidePanel(panel: SidePanel): void {
  const panels = useSidePanelState();
  const next = panels.value.filter((entry) => entry.id !== panel.id);
  next.push(panel);
  panels.value = next;
}

/** Removes the side panel registered under `id`, if any. */
export function unregisterSidePanel(id: string): void {
  const panels = useSidePanelState();
  panels.value = panels.value.filter((entry) => entry.id !== id);
}

/**
 * Resolves the width bounds of a panel, defaults applied. A `defaultWidth`
 * outside `[minWidth, maxWidth]` is brought back inside.
 */
export function resolveSidePanelWidthBounds(
  panel: SidePanel,
): SidePanelWidthBounds {
  const minWidth = panel.minWidth ?? DEFAULT_SIDE_PANEL_MIN_WIDTH;
  const maxWidth = Math.max(
    minWidth,
    panel.maxWidth ?? DEFAULT_SIDE_PANEL_MAX_WIDTH,
  );
  const defaultWidth = Math.min(
    maxWidth,
    Math.max(minWidth, panel.defaultWidth ?? DEFAULT_SIDE_PANEL_WIDTH),
  );
  return { defaultWidth, minWidth, maxWidth };
}

/**
 * The registered side panels, in registration order, and those currently
 * open. Read by the dashboard frame; modules normally only need
 * `registerSidePanel` and `unregisterSidePanel`.
 */
export function useAppSidePanels(): UseAppSidePanelsReturn {
  const state = useSidePanelState();
  const panels = computed<SidePanel[]>(() =>
    state.value.filter(isPanelRenderable),
  );
  const openPanels = computed<SidePanel[]>(() =>
    panels.value.filter(isPanelOpen),
  );
  return { panels, openPanels };
}

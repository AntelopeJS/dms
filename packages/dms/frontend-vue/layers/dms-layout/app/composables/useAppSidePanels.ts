/**
 * A panel docked on the right of the dashboard. Unlike a free overlay (see
 * {@link useAppOverlay}), the DMS owns the placement and the state: from `lg`
 * the panel sits next to the page, which shrinks to make room, behind a resize
 * handle; below `lg` it slides over the page as a sheet above a backdrop. The
 * module only declares its component; it opens and closes the panel through
 * {@link useSidePanel}.
 *
 * A registration is plain data, so it may run from a universal plugin: the
 * server renders an open panel in place, and a reload shows it without the
 * page jumping.
 */
export interface SidePanel {
  /** Unique key: dedup on `register` (upsert), target of `unregister`, and the id `useSidePanel` opens. */
  id: string;
  /**
   * Name of a global component rendered inside the panel. It fills the panel's
   * height and scrolls its own content.
   */
  component: string;
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
  panels: Readonly<Ref<SidePanel[]>>;
}

const SIDE_PANELS_STATE_KEY = "dms:side-panels";
const DEFAULT_SIDE_PANEL_WIDTH = 440;
const DEFAULT_SIDE_PANEL_MIN_WIDTH = 320;
const DEFAULT_SIDE_PANEL_MAX_WIDTH = 720;

function useSidePanelState() {
  return useDmsState<SidePanel[]>(SIDE_PANELS_STATE_KEY, () => []);
}

/**
 * Registers a {@link SidePanel}, replacing any panel registered under the same
 * `id`. Call it inside the DMS app, from a universal plugin.
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
 * The registered side panels, in registration order. Read by the dashboard;
 * modules normally only need `registerSidePanel` and {@link useSidePanel}.
 */
export function useAppSidePanels(): UseAppSidePanelsReturn {
  return { panels: useSidePanelState() };
}

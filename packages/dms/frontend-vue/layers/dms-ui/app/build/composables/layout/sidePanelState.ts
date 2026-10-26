import type { ComputedRef, Ref } from "vue";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import {
  resolveSidePanelWidthBounds,
  type SidePanel,
  type SidePanelWidthBounds,
  useAppSidePanels,
} from "../../../composables/useAppSidePanels";

/**
 * Set to the panel's width in px by the panel itself and by the dashboard
 * frame, which keeps that much room free on its right from `lg`. Both cap it
 * at 60vw.
 *
 * @internal
 */
export const SIDE_PANEL_WIDTH_VARIABLE = "--dms-side-panel-width";
/** @internal */
export const SIDE_PANEL_COOKIE = "dms-side-panel";
const SIDE_PANEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SIDE_PANEL_DRAG_WIDTH_STATE_KEY = "dms:side-panel-drag-width";

/**
 * What the DMS remembers of the side panels on this device: which one is open
 * and the width each was last given. A cookie, so the server renders the open
 * panel at its width and a reload does not move the page.
 *
 * @internal
 */
export interface SidePanelPreferences {
  openId: string | null;
  widths: Record<string, number>;
}

/** @internal */
export interface ActiveSidePanel {
  panel: ComputedRef<SidePanel | null>;
  bounds: ComputedRef<SidePanelWidthBounds | null>;
  width: ComputedRef<number>;
}

function emptyPreferences(): SidePanelPreferences {
  return { openId: null, widths: {} };
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Cookie widths are untrusted, including arrays and primitives. Inference has no source type, and SidePanelPreferences would exclude the malformed values this parser handles.
function readWidths(value: unknown): Record<string, number> {
  if (!isObject(value) || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] =>
      Number.isFinite(entry[1]),
    ),
  );
}

/**
 * Reads the cookie value back defensively: it comes from the browser, and an
 * older or hand-edited value must not break the dashboard.
 *
 * @internal
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This public cookie parser accepts arbitrary decoded browser data. Inference is unavailable and its parsed SidePanelPreferences output cannot describe invalid inputs.
export function readSidePanelPreferences(value: unknown): SidePanelPreferences {
  if (!isObject(value) || value === null) return emptyPreferences();
  const openId = isString(value.openId) ? value.openId : null;
  return { openId, widths: readWidths(value.widths) };
}

/** @internal */
export function useSidePanelPreferences(): Ref<SidePanelPreferences> {
  return useDmsCookie<SidePanelPreferences>(SIDE_PANEL_COOKIE, {
    default: emptyPreferences,
    maxAge: SIDE_PANEL_COOKIE_MAX_AGE,
  });
}

/**
 * Opens the panel `openId`, or closes every panel with `null`. One panel is
 * open at a time, so opening one closes the other.
 *
 * @internal
 */
export function setOpenSidePanel(
  preferences: Ref<SidePanelPreferences>,
  openId: string | null,
): void {
  const current = readSidePanelPreferences(preferences.value);
  if (current.openId === openId) return;
  preferences.value = { ...current, openId };
}

/** @internal */
export function isSidePanelOpen(
  preferences: Ref<SidePanelPreferences>,
  id: string,
): boolean {
  return readSidePanelPreferences(preferences.value).openId === id;
}

/** @internal */
export function toggleSidePanel(
  preferences: Ref<SidePanelPreferences>,
  id: string,
): void {
  setOpenSidePanel(preferences, isSidePanelOpen(preferences, id) ? null : id);
}

/** @internal */
export function storeSidePanelWidth(
  preferences: Ref<SidePanelPreferences>,
  id: string,
  width: number,
): void {
  const current = readSidePanelPreferences(preferences.value);
  preferences.value = {
    ...current,
    widths: { ...current.widths, [id]: width },
  };
}

/**
 * The width of the panel being dragged, shared with the dashboard frame so the
 * page follows the handle. The cookie is written once the drag ends.
 *
 * @internal
 */
export function useSidePanelDragWidth(): Ref<number | null> {
  return useDmsState<number | null>(
    SIDE_PANEL_DRAG_WIDTH_STATE_KEY,
    () => null,
  );
}

/** @internal */
export function sidePanelWidthStyle(width: number) {
  return { [SIDE_PANEL_WIDTH_VARIABLE]: `${width}px` };
}

/** @internal */
export function clampSidePanelWidth(
  width: number,
  bounds: SidePanelWidthBounds,
): number {
  return Math.round(
    Math.min(bounds.maxWidth, Math.max(bounds.minWidth, width)),
  );
}

/**
 * The width a panel was last given, or its default, within its bounds.
 *
 * @internal
 */
export function storedSidePanelWidth(
  preferences: SidePanelPreferences,
  id: string,
  bounds: SidePanelWidthBounds,
): number {
  return clampSidePanelWidth(
    preferences.widths[id] ?? bounds.defaultWidth,
    bounds,
  );
}

/**
 * The side panel the dashboard shows, and its width: the open panel, if it is
 * registered and a user is signed in. Read by the panel host and by every
 * dashboard frame, which reserves that width next to the page.
 *
 * @internal
 */
export function useActiveSidePanel(): ActiveSidePanel {
  const { panels } = useAppSidePanels();
  const preferences = useSidePanelPreferences();
  const dragWidth = useSidePanelDragWidth();
  const { loggedIn } = useDmsUserSession();
  const panel = computed(() => {
    if (!loggedIn.value) return null;
    const { openId } = readSidePanelPreferences(preferences.value);
    return panels.value.find((entry) => entry.id === openId) ?? null;
  });
  const bounds = computed(() =>
    panel.value ? resolveSidePanelWidthBounds(panel.value) : null,
  );
  const width = computed(() => {
    if (!panel.value || !bounds.value) return 0;
    if (dragWidth.value !== null) return dragWidth.value;
    const current = readSidePanelPreferences(preferences.value);
    return storedSidePanelWidth(current, panel.value.id, bounds.value);
  });
  return { panel, bounds, width };
}

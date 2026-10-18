import { type Component, type ShallowRef, shallowRef } from "vue";
import type { RowNavigationSource } from "#dms-ui/app/build/composables/actions/rowNavigation";
import type { ModalSize } from "#dms-ui/app/types/modal";
import {
  registerSidePanel,
  unregisterSidePanel,
} from "../../../composables/useAppSidePanels";
import {
  isSidePanelOpen,
  setOpenSidePanel,
  useSidePanelPreferences,
} from "./sidePanelState";

/**
 * Id of the side panel a `sidePanel` action target opens. It is registered
 * only while a row is open, so a side panel cookie still naming it after a
 * reload shows nothing.
 *
 * @internal
 */
export const ROW_SIDE_PANEL_ID = "dms:row-side-panel";
/** Registered name of `RowSidePanel.vue` (the layer's `Dms` prefix applied). */
const ROW_SIDE_PANEL_COMPONENT = "DmsRowSidePanel";

/**
 * The state the panel draws in place of the component on a row that is gone,
 * its texts translated.
 *
 * @internal
 */
export interface RowSidePanelNotFound {
  title: string;
  description: string;
}

/**
 * What the row side panel shows: the header the DMS draws, the module's
 * component and the row it receives.
 *
 * @internal
 */
export interface RowSidePanelContent {
  /** One run of an action: rows shown by stepping share it. */
  session: symbol;
  /** The table (or button bar) that opened the panel; see {@link rowSidePanelOwnerKey}. */
  ownerKey: string;
  /** The panel's title: its accessible name, and its header without a row. */
  title: string;
  /** The header's title while `row` is open (the target's `rowTitle`). */
  rowTitle?: string;
  /** The row the link names is gone: this state replaces the component. */
  notFound?: RowSidePanelNotFound;
  /** i18n key (`$`-prefixed) of the position, receiving `{ index, total }`. */
  positionLabel?: string;
  /** Width the panel opens at (the target's `size`). */
  size?: ModalSize;
  /** Slides over the page instead of docking next to it (the target's `overlay`). */
  overlay?: boolean;
  component: Component;
  /** Props of the component besides `rowData` and `navigation`. */
  componentOptions: Record<string, unknown>;
  row?: Data;
  /** Id of `row`: the key the component is mounted under, the row the table highlights. */
  rowKey?: string;
  /** The rows shown, which the panel steps through (J / K). */
  source?: RowNavigationSource;
  /** Shows another row of the same run in place. */
  showRow: (row: Data) => void;
  /** Runs once the panel closes, whatever closed it. */
  onClose?: () => void;
}

// Written on the client only (a click, a table mounting on a deep link), never
// while the server renders a request, so a module-level ref is safe here. It
// holds a component and callbacks, which no shared state may serialize.
const content = shallowRef<RowSidePanelContent | null>(null);
// The id the panel is registered under while a row is open.
let registeredId: string | null = null;

/**
 * Id of the row side panel at `size`. Widths are remembered per panel id, so
 * each size keeps the width the user gives it apart from the others; a panel
 * without one keeps the plain id, and the width already stored under it.
 *
 * @internal
 */
export function rowSidePanelId(size?: ModalSize): string {
  return size ? `${ROW_SIDE_PANEL_ID}:${size}` : ROW_SIDE_PANEL_ID;
}

function isSameRegistration(
  current: RowSidePanelContent | null,
  next: RowSidePanelContent,
): boolean {
  return (
    current?.title === next.title &&
    current.size === next.size &&
    current.overlay === next.overlay
  );
}

function register(next: RowSidePanelContent): string {
  const id = rowSidePanelId(next.size);
  if (registeredId && registeredId !== id) unregisterSidePanel(registeredId);
  registerSidePanel({
    id,
    component: ROW_SIDE_PANEL_COMPONENT,
    ariaLabel: next.title,
    size: next.size,
    overlay: next.overlay,
  });
  registeredId = id;
  return id;
}

/**
 * The key a table's open row is kept under, which the table compares to
 * highlight it.
 *
 * @internal
 */
export function rowSidePanelOwnerKey(
  pageId: string,
  componentId: string,
): string {
  return `${pageId}-${componentId}`;
}

/** @internal */
export function useRowSidePanelContent(): Readonly<
  ShallowRef<RowSidePanelContent | null>
> {
  return content;
}

/**
 * Shows `next` in the row side panel, opening it (and closing any other side
 * panel) when it is closed. Another run's content gives way: its `onClose`
 * runs first.
 *
 * @internal
 */
export function openRowSidePanel(next: RowSidePanelContent): void {
  const current = content.value;
  if (current && current.session !== next.session) current.onClose?.();
  content.value = next;
  const id =
    registeredId && isSameRegistration(current, next)
      ? registeredId
      : register(next);
  setOpenSidePanel(useSidePanelPreferences(), id);
}

function closeContent(current: RowSidePanelContent): void {
  content.value = null;
  const id = registeredId ?? rowSidePanelId(current.size);
  registeredId = null;
  unregisterSidePanel(id);
  const preferences = useSidePanelPreferences();
  if (isSidePanelOpen(preferences, id)) {
    setOpenSidePanel(preferences, null);
  }
  current.onClose?.();
}

/**
 * Closes the row side panel; with `session`, only while it still shows that
 * run.
 *
 * @internal
 */
export function closeRowSidePanel(session?: symbol): void {
  const current = content.value;
  if (!current || (session && current.session !== session)) return;
  closeContent(current);
}

/**
 * The id the row side panel is registered under, `null` while it is closed.
 *
 * @internal
 */
export function openRowSidePanelId(): string | null {
  return registeredId;
}

/**
 * Closes the row side panel while it is still registered under `id`: a panel
 * rendered under another size's id gives way without closing the row it was
 * replaced with.
 *
 * @internal
 */
export function closeRowSidePanelIn(id: string): void {
  const current = content.value;
  if (current && registeredId === id) closeContent(current);
}

/**
 * Closes the row side panel when `ownerKey` opened it: the table it belongs
 * to is gone.
 *
 * @internal
 */
export function closeRowSidePanelOf(ownerKey: string): void {
  const current = content.value;
  if (current?.ownerKey === ownerKey) closeContent(current);
}

/**
 * An icon-only button in the dashboard header. Either `onSelect` runs on
 * click, or `sidePanelId` makes the button toggle that side panel: the DMS then
 * derives the click and the engaged state from {@link useSidePanel}, and the
 * action is plain data that a universal plugin may register.
 */
export interface HeaderAction {
  id: string;
  icon: string;
  /** Tooltip and accessible name: a plain literal, or an i18n key when prefixed with "$". */
  label: string;
  /** Run on click. Required unless `sidePanelId` is set, which it overrides. */
  onSelect?: () => void;
  /** The side panel this button opens and closes (see `registerSidePanel`). */
  sidePanelId?: string;
  order?: number;
  isVisible?: () => boolean;
  /**
   * Renders the button as engaged — a toggle that is currently on. Derived
   * from the side panel when `sidePanelId` is set.
   */
  isActive?: () => boolean;
}

/**
 * The action id the builder module registers. Core renders it on the existing
 * builder button rather than as one more icon, and falls back to the
 * "coming soon" popover when no module claims it.
 */
export const BUILDER_ACTION_ID = "dms-builder-edit";

// Shared via keyed DMS app state (not a module-level ref) so any frontend module
// can register an action without a build-time dependency on this layer: it just
// pushes to useDmsState(HEADER_ACTIONS_STATE_KEY).
//
// An action that carries callables (onSelect/isVisible/isActive) must be
// registered from CLIENT context (a `.client` plugin or component setup):
// function values are not part of the SSR payload, so a server-side
// registration would arrive on the client with its callbacks stripped.
// `useHeaderActions` defensively drops any entry left with neither an onSelect
// nor a sidePanelId, so a stray server-side registration degrades to "button
// not shown" rather than a runtime crash. A side panel action is plain data
// and may be registered from a universal plugin.
const HEADER_ACTIONS_STATE_KEY = "dms:header-actions";
const DEFAULT_ORDER = 100;

function actionOrder(action: HeaderAction): number {
  return action.order ?? DEFAULT_ORDER;
}

function isActionRenderable(action: HeaderAction): boolean {
  const isSelectable =
    typeof action.onSelect === "function" ||
    typeof action.sidePanelId === "string";
  if (!isSelectable) return false;
  if (typeof action.isVisible !== "function") return true;
  return action.isVisible();
}

function useHeaderActionState() {
  return useDmsState<HeaderAction[]>(HEADER_ACTIONS_STATE_KEY, () => []);
}

/**
 * Registers a {@link HeaderAction}, replacing any action registered under the
 * same `id`. Call it inside the DMS app.
 */
export function registerHeaderAction(action: HeaderAction): void {
  const actions = useHeaderActionState();
  const existingIndex = actions.value.findIndex(
    (entry) => entry.id === action.id,
  );

  if (existingIndex === -1) {
    actions.value = [...actions.value, action];
    return;
  }

  const next = [...actions.value];
  next[existingIndex] = action;
  actions.value = next;
}

/** The visible header actions, sorted by `order`. Read by the header. */
export function useHeaderActions() {
  const actions = useHeaderActionState();
  const visibleActions = computed<HeaderAction[]>(() =>
    actions.value
      .filter(isActionRenderable)
      .sort((a, b) => actionOrder(a) - actionOrder(b)),
  );

  return { actions: visibleActions };
}

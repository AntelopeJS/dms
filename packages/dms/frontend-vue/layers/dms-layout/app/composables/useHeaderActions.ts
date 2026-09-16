export interface HeaderAction {
  id: string;
  icon: string;
  label: string;
  onSelect: () => void;
  order?: number;
  isVisible?: () => boolean;
  /** Renders the button as engaged — a toggle that is currently on. */
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
// Because actions carry callables (onSelect/isVisible), they must be registered
// from CLIENT context (a `.client` plugin or component setup): function values
// are not part of the SSR payload, so a server-side registration would arrive on
// the client with its callbacks stripped. `registerHeaderAction` calls useDmsState,
// so it must run inside the DMS app context. `useHeaderActions` defensively drops
// any entry whose onSelect was lost, so a stray server-side registration
// degrades to "button not shown" rather than a runtime crash.
const HEADER_ACTIONS_STATE_KEY = "dms:header-actions";
const DEFAULT_ORDER = 100;

function actionOrder(action: HeaderAction): number {
  return action.order ?? DEFAULT_ORDER;
}

function isActionRenderable(action: HeaderAction): boolean {
  if (typeof action.onSelect !== "function") return false;
  if (!action.isVisible) return true;
  return action.isVisible();
}

function useHeaderActionState() {
  return useDmsState<HeaderAction[]>(HEADER_ACTIONS_STATE_KEY, () => []);
}

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

export function useHeaderActions() {
  const actions = useHeaderActionState();
  const visibleActions = computed<HeaderAction[]>(() =>
    actions.value
      .filter(isActionRenderable)
      .sort((a, b) => actionOrder(a) - actionOrder(b)),
  );

  return { actions: visibleActions };
}

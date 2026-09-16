import type {
  TableViewDisplay,
  TableViewDisplayCapabilities,
} from "./types/display";

const TABLE_VIEW_DISPLAYS_STATE_KEY = "dms:table-view-displays";
const DEFAULT_ORDER = 100;

function useDisplayState() {
  return useDmsState<TableViewDisplay[]>(TABLE_VIEW_DISPLAYS_STATE_KEY, () => []);
}

function displayOrder(display: TableViewDisplay): number {
  return display.order ?? DEFAULT_ORDER;
}

/**
 * Register (or replace, by id) a table view display. Keyed DMS app state lets any
 * module register without a build-time dependency on this layer. Call from a
 * `.client.ts` plugin: displays carry callables (component, isAvailable) that are
 * stripped from the SSR payload, so the registry is client-only. Data behaviour
 * and chrome (selfManagedData/capabilities) are config-driven for SSR safety; the
 * registry powers the client-side switcher and component resolution.
 */
export function registerTableViewDisplay(display: TableViewDisplay): void {
  const displays = useDisplayState();
  const existingIndex = displays.value.findIndex(
    (entry) => entry.id === display.id,
  );

  if (existingIndex === -1) {
    displays.value = [...displays.value, display];
    return;
  }

  const next = [...displays.value];
  next[existingIndex] = display;
  displays.value = next;
}

export function useTableViewDisplays() {
  const displays = useDisplayState();
  const all = computed<TableViewDisplay[]>(() =>
    [...displays.value].sort((a, b) => displayOrder(a) - displayOrder(b)),
  );
  const getById = (id: string): TableViewDisplay | undefined =>
    all.value.find((entry) => entry.id === id);

  return { displays: all, getById };
}

/**
 * Apply capability defaults: column management is grid-only (off by default); the
 * transverse controls (filters/search/sorting/tabs) default on.
 */
export function resolveDisplayCapabilities(
  capabilities?: TableViewDisplayCapabilities,
): Required<TableViewDisplayCapabilities> {
  return {
    columnManagement: capabilities?.columnManagement ?? false,
    filters: capabilities?.filters ?? true,
    search: capabilities?.search ?? true,
    sorting: capabilities?.sorting ?? true,
    tabs: capabilities?.tabs ?? true,
  };
}

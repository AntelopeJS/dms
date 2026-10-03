import { markRaw } from "vue";
import type {
  TableViewDisplay,
  TableViewDisplayCapabilities,
} from "./types/display";

const TABLE_VIEW_DISPLAYS_STATE_KEY = "dms:table-view-displays";
const DEFAULT_ORDER = 100;

function useDisplayState() {
  return useDmsState<TableViewDisplay[]>(
    TABLE_VIEW_DISPLAYS_STATE_KEY,
    () => [],
  );
}

function displayOrder(display: TableViewDisplay): number {
  return display.order ?? DEFAULT_ORDER;
}

/**
 * Register (or replace, by id) a table view display. Keyed DMS app state lets any
 * module register without a build-time dependency on this layer. Register from a
 * universal plugin so the server render draws the switcher too (a `.client`
 * plugin works, but its display only joins the switcher after hydration). Data
 * behaviour and chrome (selfManagedData/capabilities) are config-driven; the
 * registry powers the switcher and component resolution.
 */
export function registerTableViewDisplay(entry: TableViewDisplay): void {
  const displays = useDisplayState();
  // The registry is reactive state: a component stored in it would be made
  // reactive too (Vue warns, and pays for it on every render).
  const display = entry.component
    ? { ...entry, component: markRaw(entry.component) }
    : entry;
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
    header: capabilities?.header ?? true,
  };
}

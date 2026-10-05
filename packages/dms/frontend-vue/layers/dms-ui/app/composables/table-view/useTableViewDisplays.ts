import {
  storeTableViewDisplay,
  useTableViewDisplayState,
} from "../../build/composables/table-view/displayRegistry";
import {
  RESERVED_TABLE_VIEW_DISPLAY_IDS,
  type TableViewDisplay,
  type TableViewDisplayCapabilities,
} from "./types/display";

const DEFAULT_ORDER = 100;
// `<module>:<id>`: the module's name, then the display's own id.
const MODULE_DISPLAY_ID = /^[a-z0-9][\w-]*:[\w-]+$/i;

function displayOrder(display: TableViewDisplay): number {
  return display.order ?? DEFAULT_ORDER;
}

/**
 * Register a table view display a module contributes. Keyed DMS app state lets
 * any module register without a build-time dependency on this layer. Register
 * from a universal plugin so the server render draws the switcher too (a
 * `.client` plugin works, but its display only joins the switcher after
 * hydration). Data behaviour and chrome (selfManagedData/capabilities) are
 * config-driven; the registry powers the switcher and component resolution.
 *
 * The id is `<module>:<id>` (`"saas:plan-cards"`): the built-in ids
 * (`table`, `kanban`, `cards`, `grouped`) are reserved, and an id is
 * registered once — this throws for a reserved id, an unprefixed one, or one
 * another registration already claimed.
 */
export function registerTableViewDisplay(entry: TableViewDisplay): void {
  assertModuleDisplayId(entry.id);
  storeTableViewDisplay(entry);
}

function assertModuleDisplayId(id: string): void {
  if ((RESERVED_TABLE_VIEW_DISPLAY_IDS as readonly string[]).includes(id)) {
    throw new Error(
      `[DMS] Table view display "${id}" is a built-in display: register a module display under its own id, "<module>:${id}"`,
    );
  }
  if (!MODULE_DISPLAY_ID.test(id)) {
    throw new Error(
      `[DMS] Table view display "${id}" must be named "<module>:<id>", e.g. "saas:plan-cards"`,
    );
  }
  if (useTableViewDisplayState().value.some((display) => display.id === id)) {
    throw new Error(
      `[DMS] Table view display "${id}" is already registered: one registration per id`,
    );
  }
}

export function useTableViewDisplays() {
  const displays = useTableViewDisplayState();
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

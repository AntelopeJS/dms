import { markRaw } from "vue";
import type { TableViewDisplay } from "../../../composables/table-view/types/display";

const TABLE_VIEW_DISPLAYS_STATE_KEY = "dms:table-view-displays";

/** The displays registered in this application, in registration order. */
export function useTableViewDisplayState() {
  return useDmsState<TableViewDisplay[]>(
    TABLE_VIEW_DISPLAYS_STATE_KEY,
    () => [],
  );
}

/**
 * Store a display in the registry, without the checks a module's
 * registration goes through: the DMS registers its built-in displays, under
 * their reserved ids, through this.
 */
export function storeTableViewDisplay(entry: TableViewDisplay): void {
  const displays = useTableViewDisplayState();
  // The registry is reactive state: a component stored in it would be made
  // reactive too (Vue warns, and pays for it on every render).
  const display = entry.component
    ? { ...entry, component: markRaw(entry.component) }
    : entry;
  displays.value = [
    ...displays.value.filter((registered) => registered.id !== display.id),
    display,
  ];
}

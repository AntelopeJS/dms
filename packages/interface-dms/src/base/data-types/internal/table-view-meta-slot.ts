/** @internal @packageDocumentation */
import type { TableViewMeta } from "../../table-view/meta";

let tableViewMeta: typeof TableViewMeta | undefined;

/**
 * Hand the data types the class they read a controller's table metadata
 * through. `TableViewMeta` installs itself as it evaluates: `table-view/meta`
 * reaches the data types through its own imports, so they cannot import it.
 *
 * @internal
 */
export function installTableViewMeta(meta: typeof TableViewMeta): void {
  tableViewMeta = meta;
}

/**
 * The installed `TableViewMeta`, or undefined while `table-view/meta` has not
 * evaluated, when no controller can carry table metadata yet.
 *
 * @internal
 */
export function installedTableViewMeta(): typeof TableViewMeta | undefined {
  return tableViewMeta;
}

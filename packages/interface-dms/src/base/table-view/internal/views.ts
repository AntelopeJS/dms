import { holdsPermissionGate } from "../../../internal/permission-gate";
import type {
  TableViewViewSerialized,
  TableViewViewsOptions,
  TableViewViewsSerialized,
} from "../options";

/**
 * The views as the options carry them: their permission stays server-side.
 *
 * @internal
 */
export function serializeTableViewViews(
  views: TableViewViewsOptions | undefined,
): TableViewViewsSerialized | undefined {
  if (!views) return undefined;
  return {
    ...views,
    items: views.items.map(
      ({
        permission: _permission,
        permissionId: _permissionId,
        ...view
      }): TableViewViewSerialized => view,
    ),
  };
}

/**
 * The views served to one request: a view whose permission the caller lacks
 * is left out. A default view left out falls back to the table's own state.
 *
 * @internal
 */
export async function resolveTableViewViews(
  permissions: Set<string>,
  declared: TableViewViewsOptions | undefined,
  serialized: TableViewViewsSerialized | undefined,
  componentPermissionId: string,
): Promise<TableViewViewsSerialized | undefined> {
  if (!declared || !serialized) return serialized;
  const items: TableViewViewSerialized[] = [];
  for (const [index, view] of serialized.items.entries()) {
    const gate = declared.items[index];
    if (await holdsPermissionGate(permissions, gate, componentPermissionId)) {
      items.push(view);
    }
  }
  const hasDefault = items.some((view) => view.id === serialized.defaultView);
  return {
    ...serialized,
    items,
    defaultView: hasDefault ? serialized.defaultView : undefined,
  };
}

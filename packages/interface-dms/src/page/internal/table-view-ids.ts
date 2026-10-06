import { TABLE_VIEW_COMPONENT_NAME } from "../../base/table-view/internal/options";
import type { ChildSerialized, ComponentInfoSerialized } from "../../component";

/** What a served table view learns of its place in the page. */
interface TableViewPlacement {
  /** Its key in the page, prefixing its URL keys (`?<tableId>.view=`). */
  tableId: string;
  /** No other table view shares the page: the short URL keys are its own. */
  isSoleTableView: boolean;
}

const isTableView = (component: ComponentInfoSerialized): boolean =>
  component.componentName === TABLE_VIEW_COMPONENT_NAME;

function countTableViews(component: ComponentInfoSerialized): number {
  const own = isTableView(component) ? 1 : 0;
  return (component.children ?? []).reduce(
    (total, child) => total + countTableViews(child.component),
    own,
  );
}

function placeTableViews(
  component: ComponentInfoSerialized,
  id: string,
  isSoleTableView: boolean,
): ComponentInfoSerialized {
  const children = component.children?.map((child): ChildSerialized => ({
    ...child,
    component: placeTableViews(child.component, child.id, isSoleTableView),
  }));
  const placed = children ? { ...component, children } : component;
  if (!isTableView(component)) return placed;
  const placement: TableViewPlacement = { tableId: id, isSoleTableView };
  const options = component.options as Record<string, unknown> | undefined;
  return { ...placed, options: { ...options, ...placement } };
}

/**
 * The page's components, each table view among them told its key in the
 * page and whether it is the page's only one: a URL addresses a table view's
 * views and tabs by that key, and by the short `?view=` / `?tab=` only when
 * it is alone.
 *
 * @internal
 */
export function withTableViewPlacements(
  components: Record<string, ComponentInfoSerialized>,
): Record<string, ComponentInfoSerialized> {
  const total = Object.values(components).reduce(
    (count, component) => count + countTableViews(component),
    0,
  );
  if (total === 0) return components;
  return Object.fromEntries(
    Object.entries(components).map(([id, component]) => [
      id,
      placeTableViews(component, id, total === 1),
    ]),
  );
}

/** @internal @packageDocumentation */
import type { TableViewCardOptionsSerialized } from "../options";
import type { TableViewDisplaySources } from "./factory-helpers";

/** The card both card displays draw: the table view's `card`. */
export function serializeCard({
  card,
}: TableViewDisplaySources): TableViewCardOptionsSerialized | undefined {
  if (
    !card?.fields &&
    !card?.component &&
    !card?.minWidth &&
    !card?.skeletonHeight
  )
    return undefined;
  const serialized: TableViewCardOptionsSerialized = {
    fields: card.fields,
    component: card.component?.serializeSync(),
  };
  if (card.minWidth) serialized.minWidth = card.minWidth;
  if (card.skeletonHeight) serialized.skeletonHeight = card.skeletonHeight;
  return serialized;
}

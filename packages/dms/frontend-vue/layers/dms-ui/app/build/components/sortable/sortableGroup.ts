/**
 * The lists that exchange items, typed by their item: SortableJS moves an
 * element between them, and the group carries the item it stands for.
 */
export interface SortableGroup<Item> {
  readonly name: string;
  hold: (item: Item | undefined) => void;
  held: () => Item | undefined;
}

let groupCount = 0;

/** A new group, for every list that is to exchange items with the others. */
export function sortableGroup<Item>(): SortableGroup<Item> {
  groupCount += 1;
  let dragged: Item | undefined;
  return {
    name: `dms-sortable-${groupCount}`,
    hold: (item) => {
      dragged = item;
    },
    held: () => dragged,
  };
}

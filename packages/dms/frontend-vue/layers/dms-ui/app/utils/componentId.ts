// A page's top-level block is identified by its key; a block nested in a
// layout block (a Grid, a GridRow) by its parent's id, this separator, then
// its own key.
const CHILD_SEPARATOR = "-child-";

/** The component id of the child `key` of the block `parentId`. */
export function childComponentId(parentId: string, key: string): string {
  return `${parentId}${CHILD_SEPARATOR}${key}`;
}

/**
 * The component id of the block `key` declared next to the block
 * `componentId`, under the same parent: a custom block reaching the form
 * beside it (its `FIELD_CHANGE` events) without parsing ids.
 */
export function siblingComponentId(componentId: string, key: string): string {
  const nested = componentId.lastIndexOf(CHILD_SEPARATOR);
  return nested >= 0
    ? childComponentId(componentId.slice(0, nested), key)
    : key;
}

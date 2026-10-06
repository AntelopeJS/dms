import type { Component } from "../component";

/**
 * How a position is authorized.
 *
 * - `own`: its id is registered in the grantable tree and mapped back from the
 *   component, and the position is served only once granted. Every root and
 *   synchronously declared child has its own permission.
 * - `withheld`: never served. The id belongs to something else, so no answer
 *   about it can be trusted.
 */
export type ComponentAccess = "own" | "withheld";

/**
 * One component of a page, at the position it occupies in the component tree.
 * A page's own component is the root; every `.child()` below it is a node of
 * its own, keyed by the dot-separated path of ids leading to it.
 */
export interface ComponentTreeNode {
  component: Component;
  permissionId: string;
  /** 0 for the component the page declares, 1 for its children, and so on. */
  depth: number;
  access: ComponentAccess;
}

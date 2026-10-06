import { Logging } from "@antelopejs/interface-core/logging";
import type { Component } from "../../component";
import { getDeclaredComponentChildren } from "./component-target";
import type { ComponentAccess, ComponentTreeNode } from "../component-tree";

/**
 * A child's id is its parent's followed by its own — and so is an action's, so
 * the two share one namespace. A child colliding with an action is withheld
 * rather than registered: the action's grant would otherwise serve it, and
 * either registration would take the other's entry down.
 */
function childAccess(parent: Component, childId: string): ComponentAccess {
  if (parent.actions[childId]) return "withheld";
  return "own";
}

/**
 * Flatten a page component and everything it nests, in registration order
 * (parents before their children), each with the permission id its position
 * gives it.
 *
 * @param root A component the page declares.
 * @param rootPermissionId `<page fullId>.<component key>`.
 *
 * @internal
 */
export function collectComponentTree(
  root: Component,
  rootPermissionId: string,
): ComponentTreeNode[] {
  const nodes: ComponentTreeNode[] = [];
  const ancestors = new Set<Component>();

  const walk = (node: ComponentTreeNode): void => {
    if (ancestors.has(node.component)) {
      Logging.Warn(
        `[dms] component "${node.permissionId}" nests itself; the cycle is not walked further.`,
      );
      return;
    }
    nodes.push(node);
    // Recorded, so the filter knows to withhold it, but not walked: nothing
    // below a position that is never served can be reached either.
    if (node.access === "withheld") {
      Logging.Error(
        `[dms] "${node.permissionId}" is claimed by both an action and a child of the same name; the child and everything below it is withheld. Rename one of them.`,
      );
      return;
    }

    ancestors.add(node.component);
    for (const child of getDeclaredComponentChildren(node.component)) {
      walk({
        component: child.component,
        permissionId: `${node.permissionId}.${child.id}`,
        depth: node.depth + 1,
        access: childAccess(node.component, child.id),
      });
    }
    ancestors.delete(node.component);
  };

  walk({
    component: root,
    permissionId: rootPermissionId,
    depth: 0,
    access: "own",
  });
  return nodes;
}

/** @internal */
import { Logging } from "@antelopejs/interface-core/logging";
import type { Component, ComponentInfoSerialized } from "../../component";
import type { NativeUploadFieldRegistration } from "../../internal/uploads";
import {
  type Permission,
  RegisterPermission,
  UnregisterPermission,
} from "../../permissions";
import { internal as uploadInternal } from "../../uploads";
import type { ComponentTreeNode } from "../component-tree";
import { PageDeclarationConflictError } from "../declaration-conflict";
import type { ComponentNodeMap } from "../layout-filter";
import type { PageMetadata } from "../metadata";
import { collectComponentTree } from "./component-tree";
import { opensToMembers } from "./member-access";
import type { PageRegistration } from "./page-registration";
import { pageMetadataByFullId, permissionMap } from "./registry";

/** @internal */
export function actionPermissions(
  component: Component,
  pageInfo: PageMetadata["pageInfo"],
): Permission[] {
  const grantsMembers = opensToMembers(pageInfo?.memberAccess);
  return Object.values(component.actions)
    .map((action) => action.toPermission())
    .filter((permission): permission is Permission => !!permission)
    .map((permission) =>
      grantsMembers ? { ...permission, defaultGranted: true } : permission,
    );
}

/** @internal */
export function notifyPageCreated(
  page: PageMetadata,
  node: ComponentTreeNode,
  notified: () => Set<Component>,
): void {
  if (!node.component.onPageCreated) return;
  if (notified().has(node.component)) return;
  notified().add(node.component);
  if (node.depth === 0) {
    node.component.onPageCreated(page);
    return;
  }
  try {
    node.component.onPageCreated(page);
  } catch (error) {
    if (error instanceof PageDeclarationConflictError) throw error;
    Logging.Error(
      `[dms] component "${node.permissionId}" failed its onCreated hook on page "${page.pageInfo?.fullId}": ${String(error)}`,
    );
  }
}

interface ComponentRegistrationContext {
  componentMap(): ComponentNodeMap;
  pageInfo(): PageMetadata["pageInfo"];
  registersComponentPermissions(): boolean;
  actionPermissions(component: Component): Permission[];
  notify(node: ComponentTreeNode): void;
}

/** @internal */
export function registerComponentNode(
  node: ComponentTreeNode,
  context: ComponentRegistrationContext,
): void {
  const { component, permissionId } = node;
  context.componentMap().set(permissionId, node);
  if (node.access === "withheld") return;
  if (node.access === "own" && !permissionMap.has(component))
    permissionMap.set(component, permissionId);
  if (context.registersComponentPermissions() && node.access === "own") {
    RegisterPermission(permissionId, {
      id: permissionId,
      title: component.metadata.name,
      icon: component.metadata.icon,
      description: component.metadata.description,
      defaultGranted: opensToMembers(context.pageInfo()?.memberAccess),
    });
  }
  context.notify(node);
  if (context.registersComponentPermissions()) {
    for (const actionPermission of context.actionPermissions(component))
      RegisterPermission(actionPermission.id, actionPermission);
  }
}

/** @internal */
export function unregisterComponentNode(
  node: ComponentTreeNode,
  registers: () => boolean,
  actions: (node: ComponentTreeNode) => Permission[],
): void {
  if (node.access === "withheld") return;
  if (registers()) {
    for (const actionPermission of actions(node))
      UnregisterPermission(actionPermission.id);
  }
  if (node.access !== "own") return;
  if (registers()) UnregisterPermission(node.permissionId);
  if (permissionMap.get(node.component) === node.permissionId)
    permissionMap.delete(node.component);
}

interface ComponentRemovalContext {
  trees(): Map<string, ComponentTreeNode[]>;
  uploads(): Map<string, NativeUploadFieldRegistration[]>;
  nodes(): ComponentNodeMap;
  notified(): Set<Component>;
  ownsPermissions(): boolean;
  unregister(node: ComponentTreeNode): void;
}

/** @internal */
export function unregisterComponent(
  componentKey: string,
  context: ComponentRemovalContext,
): void {
  const nodes = context.trees().get(componentKey);
  if (!nodes) return;
  context.trees().delete(componentKey);
  for (const node of nodes) {
    for (const field of context.uploads().get(node.permissionId) ?? [])
      uploadInternal.RegisterNativeUploadField.unregister(field);
    context.uploads().delete(node.permissionId);
    context.nodes().delete(node.permissionId);
    context.notified().delete(node.component);
  }
  if (!context.ownsPermissions()) {
    for (const node of nodes) releaseComponentIdentity(node);
    return;
  }
  for (const node of nodes) context.unregister(node);
}

/**
 * Drop a position's entry from the permission map on behalf of a page that no
 * longer owns its id, unless a live page holds the same component at that
 * position. Only the entry is released: the permissions of the position and of
 * its component's actions stay registered.
 */
function releaseComponentIdentity(node: ComponentTreeNode): void {
  if (node.access !== "own") return;
  if (permissionMap.get(node.component) !== node.permissionId) return;
  const held = [...pageMetadataByFullId.values()].some((page) =>
    page.ComponentPermissionIds(node.component).includes(node.permissionId),
  );
  if (!held) permissionMap.delete(node.component);
}

interface ComponentPreparationContext {
  permissionId(key: string): string;
  trees(): Map<string, ComponentTreeNode[]>;
  registration(): PageRegistration;
  unregister(component: Component, key: string): void;
  register(node: ComponentTreeNode): void;
  detached(): boolean;
  bind(serialized: ComponentInfoSerialized, key: string): Promise<void>;
}

/** @internal */
export function prepareComponent(
  component: Component,
  componentKey: string,
  context: ComponentPreparationContext,
): () => Promise<{ key: string; serialized: ComponentInfoSerialized }> {
  const nodes = collectComponentTree(
    component,
    context.permissionId(componentKey),
  );
  context.trees().set(componentKey, nodes);
  context
    .registration()
    .track(() => context.unregister(component, componentKey));
  for (const node of nodes) context.register(node);
  return async () => {
    const serialized = await component.serialize();
    if (context.detached() || context.trees().get(componentKey) !== nodes)
      return { key: componentKey, serialized };
    await context.bind(serialized, componentKey);
    return { key: componentKey, serialized };
  };
}

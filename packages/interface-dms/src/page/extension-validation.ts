import type { ChildSerialized, ComponentInfoSerialized } from "../component";
import type { PageExtensionComponent, PageExtensionInfo } from "./types";

/**
 * The target page as an extension sees it when the injection applies: its own
 * serialized components, and every component key already spoken for on the
 * page — its own fields and the ones earlier extensions injected — mapped to
 * whoever owns it. A page's keys share one namespace because they share one
 * permission subtree.
 */
export interface ExtensionTargetView {
  own: Record<string, ComponentInfoSerialized>;
  taken: Map<string, string>;
}

function childrenOf(
  component: ComponentInfoSerialized | undefined,
): ChildSerialized[] {
  return component?.children ?? [];
}

function resolveAnchor(
  own: Record<string, ComponentInfoSerialized>,
  path: readonly string[],
): ComponentInfoSerialized | undefined {
  const [rootKey, ...childIds] = path;
  let current: ComponentInfoSerialized | undefined = own[rootKey ?? ""];
  for (const id of childIds) {
    current = childrenOf(current).find((child) => child.id === id)?.component;
  }
  return current;
}

function anchorErrors(
  info: PageExtensionInfo,
  contribution: PageExtensionComponent,
  own: Record<string, ComponentInfoSerialized>,
): string[] {
  const path = contribution.anchorPath;
  if (!path || path.length === 0) return [];
  if (!resolveAnchor(own, path)) {
    return [
      `page extension "${info.extensionName}" anchors "${contribution.key}" on "${path.join(".")}", which page "${info.targetFullId}" does not declare.`,
    ];
  }
  if (path.length === 1) return [];

  const parent = resolveAnchor(own, path.slice(0, -1));
  if (childrenOf(parent).some((child) => child.id === contribution.key)) {
    return [
      `page extension "${info.extensionName}" injects child "${contribution.key}" next to "${path.join(".")}" on page "${info.targetFullId}", but that id already belongs to the anchor's parent. Rename the field.`,
    ];
  }
  return [];
}

/**
 * Everything wrong with an extension, read against the page it is about to be
 * grafted onto. Reported rather than thrown: the extending module declared it
 * against a page id, so nothing could be checked when it was declared, and a
 * mistake there must cost that extension, not the DMS.
 */
export function collectExtensionErrors(
  info: PageExtensionInfo,
  target: ExtensionTargetView,
): string[] {
  const errors: string[] = [];
  for (const contribution of info.components) {
    const owner = target.taken.get(contribution.key);
    if (owner !== undefined) {
      errors.push(
        `page extension "${info.extensionName}" injects "${contribution.key}" into page "${info.targetFullId}", but that key already belongs to "${owner}". Rename the field.`,
      );
    }
    errors.push(...anchorErrors(info, contribution, target.own));
  }
  return errors;
}

/** @internal @packageDocumentation */
import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { ComponentInfo } from "../../component";
import type { PageMetadata } from "../metadata";
import type { CategoryInfo } from "../types";

let pageMetadata: typeof PageMetadata;

/**
 * Hand category resolution the class it reads a controller's page metadata
 * through. `PageMetadata` installs itself as it evaluates: `page/metadata`
 * reaches this module through its own imports, so this module cannot import it.
 *
 * @internal
 */
export function installPageMetadata(metadata: typeof PageMetadata): void {
  pageMetadata = metadata;
}

/** Whether a category names its controller class rather than its CategoryInfo. */
const isControllerClass = (
  category: CategoryInfo | ControllerClass | undefined,
): category is ControllerClass => typeof category === "function";

/**
 * Resolve a category to CategoryInfo
 * @param category A CategoryInfo object or a ControllerClass
 * @returns The resolved CategoryInfo
 *
 * @internal
 */
export function resolveCategoryInfo(
  category: CategoryInfo | ControllerClass | undefined,
): CategoryInfo | undefined {
  if (!category) {
    return undefined;
  }

  if (isControllerClass(category)) {
    const meta = GetMetadata(category, pageMetadata);
    if (!meta.pageInfo) {
      throw new Error(`PageMetadata not initialized for controller class.`);
    }
    return meta.pageInfo;
  }

  return category;
}

/**
 * The default layout a page or category declared under `category` inherits:
 * the `layout` of the nearest ancestor that declares one.
 *
 * @param category The parent the entry is declared under
 * @returns That layout, or undefined when no ancestor declares one
 *
 * @internal
 */
export function resolveInheritedLayout(
  category: CategoryInfo | ControllerClass | undefined,
): ComponentInfo | undefined {
  let current = findCategoryInfo(category);
  while (current) {
    if (current.layout) return current.layout;
    current = findCategoryInfo(current.category);
  }
  return undefined;
}

function findCategoryInfo(
  category: CategoryInfo | ControllerClass | undefined,
): CategoryInfo | undefined {
  if (!isControllerClass(category)) return category;
  return GetMetadata(category, pageMetadata).pageInfo;
}

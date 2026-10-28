/** @internal */
import { Action } from "../../component";
import type { CategoryInfo } from "../types";

/**
 * The permission id a category owns: its own `fullId` unless it overrides it
 * with a permission object. A category whose permission is an `Action` owns
 * none, since the Action's permission belongs to its component and is only
 * known once that component sits on a page.
 *
 * @internal
 */
export function categoryOwnPermissionId(category: CategoryInfo): string {
  const permission = category.permission;
  if (permission instanceof Action) return category.fullId;
  return permission?.id || category.fullId;
}

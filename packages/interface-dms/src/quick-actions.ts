import type { ControllerClass } from "@antelopejs/interface-api";
import { RegisteringProxy } from "@antelopejs/interface-core";
import type { ComponentTargetInput } from "./component";

export interface QuickActionCategoryInfo {
  id: string;
  displayName: string;
  icon?: string;
  order?: number;
}

/**
 * The page a quick action belongs to.
 *
 * Access follows that page — its permission, and the tenant access gate with
 * its `bypassTenantAccessGate` flag — so an action can never offer what its
 * page refuses. The route the client navigates to is derived from it, which is
 * also why the page is a controller class rather than a slug: nothing to keep
 * in sync, and a renamed page cannot leave a stale link behind.
 */
export interface QuickActionPageTarget {
  page: ControllerClass;
}

export type QuickActionTarget =
  | (QuickActionPageTarget & {
      type: "navigate";
      query?: Record<string, string>;
    })
  | (QuickActionPageTarget & {
      type: "openForm";
      /**
       * Which table view to open the creation form of. Required once the page
       * mounts more than one component that can create a row — the action is
       * not served, with a warning, while the choice stays ambiguous. Use
       * `MyPage.content.targetChild("table")` for a nested table view.
       */
      component?: ComponentTargetInput;
    })
  | (QuickActionPageTarget & {
      type: "button";
      /**
       * The `id` of the button to press — a table view's `customButtons[].id`.
       * The action opens what the button opens, and is listed only for a
       * caller the button's own `permission` admits: it declares none of its
       * own, so the two cannot drift apart.
       */
      button: string;
      /**
       * Which component carries the button. Required once several components
       * of the page declare that button id — the action is not served, with a
       * warning, while the choice stays ambiguous.
       */
      component?: ComponentTargetInput;
    })
  | (QuickActionPageTarget & {
      type: "event";
      name: string;
      payload?: unknown;
    });

export interface QuickActionInfo {
  id: string;
  category: QuickActionCategoryInfo;
  displayName: string;
  icon: string;
  order?: number;
  target: QuickActionTarget;
}

export namespace internal {
  export const RegisterQuickActionCategory = new RegisteringProxy<
    (info: QuickActionCategoryInfo) => void
  >();
  export const RegisterQuickAction = new RegisteringProxy<
    (info: QuickActionInfo) => void
  >();
}

export function QuickActionCategory(
  id: string,
  info: Omit<QuickActionCategoryInfo, "id">,
): QuickActionCategoryInfo {
  const categoryInfo: QuickActionCategoryInfo = { id, ...info };
  internal.RegisterQuickActionCategory.register(categoryInfo);
  return categoryInfo;
}

export function QuickAction(
  id: string,
  info: Omit<QuickActionInfo, "id">,
): QuickActionInfo {
  const actionInfo: QuickActionInfo = { id, ...info };
  internal.RegisterQuickAction.register(actionInfo);
  return actionInfo;
}

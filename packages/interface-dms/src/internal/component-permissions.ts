/** @internal */
import type {
  Action,
  ButtonPermission,
  Component,
  getPermissionIdRef,
} from "../component";
import type { Permission } from "../permissions";

/** @internal */
export const actionComponents = new WeakMap<Action, Component>();

/** @internal */
export function componentPermissionId(
  action: Action,
  ref: typeof getPermissionIdRef,
): string | undefined {
  const component = actionComponents.get(action);
  if (!component) return undefined;
  return ref.get(component);
}

/** @internal */
export function actionPermissionId(
  action: Action,
  componentPermissionId: string | undefined,
): string | undefined {
  if (!componentPermissionId) return undefined;
  return `${componentPermissionId}.${action.id}`;
}

/** @internal */
export function toActionPermission(
  action: Action,
  componentPermissionId: string | undefined,
): Permission | undefined {
  if (!componentPermissionId) return undefined;
  return {
    id: `${componentPermissionId}.${action.id}`,
    title: action.definition.title,
    icon: action.definition.icon,
    description: action.definition.description,
    dependencies: action.definition.dependencies?.map(
      (actionId) => `${componentPermissionId}.${actionId}`,
    ),
    defaultGranted: action.definition.defaultGranted,
  };
}

/** @internal */
export function resolveButtonPermissionId(
  permission: ButtonPermission,
  componentPermissionId: string | undefined,
): string | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The published permission union distinguishes a relative string id from an Action instance.
  if (typeof permission !== "string") return permission.permissionId;
  if (!componentPermissionId) return undefined;
  return `${componentPermissionId}.${permission}`;
}

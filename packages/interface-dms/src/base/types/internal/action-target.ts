import type { ActionTarget, ActionTargetSerialized } from "../action-target";

/**
 * An action target as the options carry it: a component target is serialized,
 * every other kind is plain data already.
 *
 * @internal
 */
export function serializeActionTarget(
  target: ActionTarget,
): ActionTargetSerialized {
  if (target.type === "drawer" || target.type === "modal") {
    return { ...target, component: target.component.serializeSync() };
  }
  return target;
}

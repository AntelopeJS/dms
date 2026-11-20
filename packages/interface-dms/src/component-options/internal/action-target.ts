import type { ActionTarget, ActionTargetSerialized } from "../action-target";

const DASHBOARD_PATH = /^\/(?![/\\])/;

/**
 * An action target as the options carry it: a component target is serialized,
 * every other kind is plain data already. Throws on an `api` target whose
 * `redirect` is not a path of the dashboard (one leading `/`, so neither a
 * scheme nor a protocol-relative `//host`).
 *
 * @internal
 */
export function serializeActionTarget(
  target: ActionTarget,
): ActionTargetSerialized {
  if (
    target.type === "drawer" ||
    target.type === "modal" ||
    target.type === "sidePanel"
  ) {
    return { ...target, component: target.component.serializeSync() };
  }
  if (
    target.type === "api" &&
    target.redirect !== undefined &&
    !DASHBOARD_PATH.test(target.redirect)
  ) {
    throw new Error(
      `An "api" action target redirects to a path of the dashboard, starting with "/": "${target.redirect}" is not one`,
    );
  }
  return target;
}

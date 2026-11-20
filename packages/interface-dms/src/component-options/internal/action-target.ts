import type { ActionTarget, ActionTargetSerialized } from "../action-target";

const DASHBOARD_PATH = /^\/(?![/\\])/;

/**
 * Throws unless `redirect` is a path of the dashboard: it starts with one
 * `/`, so neither a scheme nor a protocol-relative `//host` can lead the user
 * to another site.
 *
 * @internal
 */
export function assertDashboardRedirect(redirect: string): void {
  if (!DASHBOARD_PATH.test(redirect)) {
    throw new Error(
      `An "api" action target redirects to a path of the dashboard, starting with "/": "${redirect}" is not one`,
    );
  }
}

/**
 * An action target as the options carry it: a component target is serialized,
 * every other kind is plain data already. An `api` target's `redirect` is
 * checked by {@link assertDashboardRedirect}.
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
  if (target.type === "api" && target.redirect !== undefined) {
    assertDashboardRedirect(target.redirect);
  }
  return target;
}

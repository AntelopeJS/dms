import type { QuickActionTarget } from "@antelopejs/interface-dms/quick-actions";
import type { QuickActionTargetSerialized } from "../quick-actions";
import { GetMetadata } from "@antelopejs/interface-core";
import { PageMetadata } from "@antelopejs/interface-dms/page";
import { warnOnceFor } from "../../../store/frontend";
import { HasPermission } from "@antelopejs/interface-dms/permissions";
import type {
  Component,
  ComponentButton,
} from "@antelopejs/interface-dms/component";
import { isPermissionGated } from "@antelopejs/interface-dms/internal/permission-gate";
import {
  resolveComponentTarget,
  componentTargetClientId,
} from "@antelopejs/interface-dms/page/internal/component-target";
import type {
  QuickActionTargetHandlers,
  RequestAccessContext,
  QuickActionTargetHandler,
  QuickActionPage,
  QuickActionTargetOf,
  QuickActionComponentFilter,
} from "./types";
import { computeEntryAccess, selectEntryContext } from "./access";

export const quickActionTargetHandlers: QuickActionTargetHandlers = {
  event: async (target) => ({
    type: "event",
    name: target.name,
    payload: target.payload,
  }),
  navigate: async (target, { pageInfo }) => ({
    type: "navigate",
    to: pageInfo.fullSlug,
    query: target.query,
  }),
  openForm: resolveOpenFormTarget,
  button: resolveButtonTarget,
};

function handlerFor<K extends QuickActionTarget["type"]>(
  type: K,
): QuickActionTargetHandler<K> {
  return quickActionTargetHandlers[type];
}

export async function resolveQuickActionTarget(
  target: QuickActionTarget,
  context: RequestAccessContext,
): Promise<QuickActionTargetSerialized | undefined> {
  const meta = GetMetadata(target.page, PageMetadata);
  const pageInfo = meta.pageInfo;
  if (!pageInfo) {
    warnOnceFor(
      target,
      "unregistered-page",
      `[DMS] Quick action targets "${target.page.name}", which is not a registered page: the action is not served.`,
    );
    return undefined;
  }
  if (!(await computeEntryAccess(pageInfo, context))) return undefined;

  const handler = handlerFor(target.type);
  return handler(target, { pageInfo, meta, context });
}

export function holdsPagePermission(
  page: QuickActionPage,
  permissionId: string,
): Promise<boolean> {
  return HasPermission(
    selectEntryContext(page.pageInfo, page.context).permissions,
    permissionId,
  );
}

export async function resolveOpenFormTarget(
  target: QuickActionTargetOf<"openForm">,
  page: QuickActionPage,
): Promise<QuickActionTargetSerialized | undefined> {
  const resolved = resolveQuickActionComponent(page.meta, target, {
    accepts: (component) => component.getAction("add") !== undefined,
    description: "can create a row",
  });
  if (!resolved) return undefined;
  const [componentKey, component] = resolved;
  const addPermission = component.getAction("add")?.permissionId;
  if (addPermission && !(await holdsPagePermission(page, addPermission))) {
    return undefined;
  }
  return {
    type: "openForm",
    to: page.pageInfo.fullSlug,
    component: componentKey,
  };
}

export async function resolveButtonTarget(
  target: QuickActionTargetOf<"button">,
  page: QuickActionPage,
): Promise<QuickActionTargetSerialized | undefined> {
  const resolved = resolveQuickActionComponent(page.meta, target, {
    accepts: (component) => component.getButton(target.button) !== undefined,
    description: `declare button "${target.button}"`,
  });
  if (!resolved) return undefined;
  const [componentKey, component] = resolved;
  const button = component.getButton(target.button);
  if (!button) {
    warnOnceFor(
      target,
      "unknown-button",
      `[DMS] Quick action presses button "${target.button}", which the targeted component of page "${page.meta.pageInfo?.fullId}" does not declare: the action is not served.`,
    );
    return undefined;
  }
  if (!(await holdsButtonPermission(page, component, button))) {
    return undefined;
  }
  return {
    type: "button",
    to: page.pageInfo.fullSlug,
    component: componentKey,
    button: button.id,
  };
}

export async function holdsButtonPermission(
  page: QuickActionPage,
  component: Component,
  button: ComponentButton,
): Promise<boolean> {
  if (!isPermissionGated(button)) return true;
  const permissionId =
    button.permissionId ??
    (button.permission === undefined
      ? undefined
      : component.resolveButtonPermissionId(button.permission));
  return (
    permissionId !== undefined &&
    (await holdsPagePermission(page, permissionId))
  );
}

/**
 * The component a quick action addresses, and the key the browser addresses
 * it by.
 *
 * Always resolved here rather than left to the client: several table views can
 * share a page, and an unnamed target would have every one of them answer at
 * once. Naming the component object — not a string — is what keeps a renamed
 * or moved component from leaving a dangling reference behind.
 */
export function resolveQuickActionComponent(
  meta: PageMetadata,
  target: QuickActionTargetOf<"openForm" | "button">,
  filter: QuickActionComponentFilter,
): [string, Component] | undefined {
  const requested = target.component;
  const entries = Object.entries(meta.components);
  if (requested) {
    const resolved = resolveComponentTarget(requested, new Map(entries));
    if (!resolved) {
      warnOnceFor(
        target,
        "unknown-component",
        `[DMS] Quick action targets a component that page "${meta.pageInfo?.fullId}" does not mount: the action is not served.`,
      );
      return undefined;
    }
    return [componentTargetClientId(resolved), resolved.component];
  }

  const candidates = entries.filter(([, candidate]) =>
    filter.accepts(candidate),
  );
  if (candidates.length === 1) return candidates[0];
  warnOnceFor(
    target,
    "ambiguous-component",
    `[DMS] Quick action targets page "${meta.pageInfo?.fullId}", which mounts ${candidates.length} components that ${filter.description}: name the one it means. The action is not served.`,
  );
  return undefined;
}

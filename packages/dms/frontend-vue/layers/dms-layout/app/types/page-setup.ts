import type { PageInfo } from "#dms-core/app/types/page";
import type { ComponentEventData } from "#dms-core/app/types/component";

/** Cleanup callback returned by a PageSetupFunction. Called on page unmount. */
export type PageSetupCleanup = () => void;

/**
 * Context passed to a PageSetupFunction. Use on(component, event, handler)
 * to subscribe (returns an unsubscribe). Use emit(component, event, data) to
 * dispatch on the shared window event bus.
 */
export interface PageSetupContext {
  pageInfo: PageInfo;
  permissions: Set<string>;
  on(
    component: string,
    event: string,
    handler: (data: ComponentEventData["data"]) => void,
  ): () => void;
  emit(
    component: string,
    event: string,
    data?: ComponentEventData["data"],
  ): void;
}

/**
 * Page-level setup function referenced by MenuOptions.setupId. Register on the
 * frontend via useDefinedFunctions().registerFunction(). Runs in onMounted;
 * cleanup runs on onUnmounted.
 */
export type PageSetupFunction = (
  context: PageSetupContext,
) => Promise<PageSetupCleanup | void> | PageSetupCleanup | void;

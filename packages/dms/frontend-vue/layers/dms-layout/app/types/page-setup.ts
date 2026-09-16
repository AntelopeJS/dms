import type { PageInfo } from "./page";

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
    handler: (data: unknown) => void,
  ): () => void;
  emit(component: string, event: string, data?: unknown): void;
}

/**
 * Page-level setup function referenced by MenuOptions.setupId. Register on the
 * frontend via useDefinedFunctions().registerFunction(). Runs in onMounted;
 * cleanup runs on onUnmounted.
 */
/* eslint-disable @typescript-eslint/no-invalid-void-type -- void permits callers to omit return */
export type PageSetupFunction = (
  context: PageSetupContext,
) => Promise<PageSetupCleanup | void> | PageSetupCleanup | void;
/* eslint-enable @typescript-eslint/no-invalid-void-type */

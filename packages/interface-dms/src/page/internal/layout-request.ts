/** @internal @packageDocumentation */
import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext } from "@antelopejs/interface-api";

const layoutRequests = new AsyncLocalStorage<RequestContext>();

/**
 * Serves a page layout for `ctx`: the components filtered while `serve`
 * runs read their rows as that request.
 *
 * @internal
 */
export function withLayoutRequest<T>(
  ctx: RequestContext,
  serve: () => Promise<T>,
): Promise<T> {
  return layoutRequests.run(ctx, serve);
}

/**
 * The request whose page layout is being served, when one is.
 *
 * @internal
 */
export function currentLayoutRequest(): RequestContext | undefined {
  return layoutRequests.getStore();
}

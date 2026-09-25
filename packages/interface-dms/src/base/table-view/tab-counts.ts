import type { DataControllerCallbackWithOptions } from "@antelopejs/interface-data-api";

/**
 * How a table view's filter tabs fetch their counters, decided from the routes
 * its data controller exposes. Controllers pick their routes by hand, and many
 * list `count` without `countBatch`: calling `/count/batch` on those answers
 * 404 on every page view.
 *
 * - `batch`: one `POST <location>/count/batch` for every tab;
 * - `single`: one `GET <location>/count` per tab;
 * - `none`: no counter route, the tabs show no count.
 */
export type TableViewTabCountMode = "batch" | "single" | "none";

type ControllerEndpoints = Record<string, DataControllerCallbackWithOptions>;

interface CountRoute {
  path: string;
  method: string;
}

const BATCH_COUNT_ROUTE: CountRoute = { path: "count/batch", method: "post" };
const SINGLE_COUNT_ROUTE: CountRoute = { path: "count", method: "get" };
const EDGE_SLASHES = /^\/+|\/+$/g;

function exposesRoute(endpoints: ControllerEndpoints, route: CountRoute) {
  return Object.entries(endpoints).some(
    ([key, entry]) =>
      (entry.endpoint ?? key).replace(EDGE_SLASHES, "") === route.path &&
      entry.callback.method === route.method,
  );
}

/**
 * Matched on the mounted path and method rather than on the route objects: a
 * module hands over a per-context view of `TableViewRoutes`, so identity does
 * not survive, and a controller may mount the route under any key.
 */
export function resolveTabCountMode(
  endpoints: ControllerEndpoints,
): TableViewTabCountMode {
  if (exposesRoute(endpoints, BATCH_COUNT_ROUTE)) return "batch";
  if (exposesRoute(endpoints, SINGLE_COUNT_ROUTE)) return "single";
  return "none";
}

import type {
  MappedResource,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";

const READ_ROUTES: ResourceRoute[] = ["list", "get", "select", "export"];

/**
 * A TableView's routes: all of them when writable, the read ones otherwise. A stats-only relation
 * serves none: its controller exists so queries can name it as a resource, and nothing reaches
 * it over HTTP.
 */
export function RoutesOf(
  resource: MappedResource,
): ResourceRoute[] | undefined {
  if (!resource.tableView) {
    return [];
  }
  return resource.writable ? undefined : READ_ROUTES;
}

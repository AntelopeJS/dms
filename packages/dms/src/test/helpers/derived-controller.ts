import { Controller, type ControllerClass } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";

type TableClass = Parameters<typeof DataController>[0];

/**
 * A data controller derived from `parent`, over the same table, at `location`:
 * a suite mounting several writing TableViews over the same rows gives each its
 * own, since a data controller has one writing TableView.
 */
export function derivedController<P extends ControllerClass>(
  table: TableClass,
  parent: P,
  location: string,
) {
  @RegisterDataController()
  class DerivedController extends DataController(
    table,
    {},
    Controller(location, parent),
  ) {}
  return DerivedController;
}

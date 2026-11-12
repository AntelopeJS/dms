import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { TableViewMeta } from "../meta";

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published adapter accepts arbitrary controller receivers; the metadata lookup below assumes a registered constructor without validating it.
export const getTableViewMetaFor = (target: unknown): TableViewMeta =>
  GetMetadata(
    // SAFETY: The receiver is the `this` of a table-view controller route, whose constructor is the registered controller class; the parameter is unknown only because route dispatch types it loosely.
    (target as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published metadata adapter accepts arbitrary controller receivers; narrowing its input would change that contract.
export const getControllerLocation = (target: unknown): string =>
  // SAFETY: The receiver is the `this` of a table-view controller route, whose constructor is the registered controller class that carries `location`; the parameter is unknown only because route dispatch types it loosely.
  (target as { constructor: ControllerClass }).constructor.location;

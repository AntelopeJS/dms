import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { TableViewMeta } from "../meta";

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published adapter accepts arbitrary controller receivers; the metadata lookup below assumes a registered constructor without validating it.
export const getTableViewMetaFor = (target: unknown): TableViewMeta =>
  GetMetadata(
    // SAFETY: Every caller passes a data controller instance, a route's `this` or the controller a request resolved, whose constructor is its registered ControllerClass.
    (target as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published metadata adapter accepts arbitrary controller receivers; narrowing its input would change that contract.
export const getControllerLocation = (target: unknown): string =>
  // SAFETY: Every caller passes a data controller instance, a route's `this` or the controller a request resolved, whose constructor is its registered ControllerClass, which carries `location`.
  (target as { constructor: ControllerClass }).constructor.location;

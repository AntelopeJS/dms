import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { controllerLocation } from "../../../utils/internal/decorated-class";
import { TableViewMeta } from "../meta";

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published adapter accepts arbitrary controller receivers; the metadata lookup below assumes a registered constructor without validating it.
export const getTableViewMetaFor = (target: unknown): TableViewMeta =>
  GetMetadata(
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published unknown receiver does not prove ControllerClass; controller route dispatch supplies it and this adapter preserves that unchecked boundary.
    (target as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published metadata adapter accepts arbitrary controller receivers; narrowing its input would change that contract.
export const getControllerLocation = (target: unknown): string =>
  controllerLocation(
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published unknown receiver does not verify its constructor; route dispatch remains responsible for supplying a controller instance.
    (target as { constructor: ControllerClass }).constructor,
  );

import {
  type ControllerClass,
  ControllerMeta,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { TableViewMeta } from "../meta";

/** @internal */
export const getTableViewMetaFor = (target: unknown): TableViewMeta =>
  GetMetadata(
    (target as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );

/** @internal */
export const getControllerLocation = (target: unknown): string =>
  GetMetadata(
    (target as { constructor: ControllerClass }).constructor,
    ControllerMeta,
  ).location;

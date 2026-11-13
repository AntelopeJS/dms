import { GetMetadata } from "@antelopejs/interface-core";
import { isControllerClass } from "../../../utils/internal/controller-class";
import { isClass, isObject } from "../../../utils/internal/type-check";
import { TableViewMeta } from "../meta";

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published adapter accepts arbitrary controller receivers and refuses one that is no class instance.
export const getTableViewMetaFor = (target: unknown): TableViewMeta => {
  const owner =
    isObject(target) && target !== null ? target.constructor : undefined;
  if (!isClass(owner)) {
    throw new TypeError(
      "A table view's controller receiver must be an instance of a class",
    );
  }
  return GetMetadata(owner, TableViewMeta);
};

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published metadata adapter accepts arbitrary controller receivers and refuses one whose constructor is no Controller class.
export const getControllerLocation = (target: unknown): string => {
  const owner =
    isObject(target) && target !== null ? target.constructor : undefined;
  if (!isControllerClass(owner)) {
    throw new TypeError(
      "A table view's controller receiver must be an instance of a Controller class",
    );
  }
  return owner.location;
};

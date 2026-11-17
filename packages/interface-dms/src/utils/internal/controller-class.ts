import type { ControllerClass } from "@antelopejs/interface-api";
import { isClass, isFunction, isString } from "./type-check";

/**
 * Whether a value is a class `Controller` built: one carrying the string
 * `location` and the `extend` method `Controller` assigns, inherited by its
 * subclasses.
 *
 * @internal
 */
export function isControllerClass(value: unknown): value is ControllerClass {
  return (
    isClass(value) &&
    "location" in value &&
    isString(value.location) &&
    "extend" in value &&
    isFunction(value.extend)
  );
}

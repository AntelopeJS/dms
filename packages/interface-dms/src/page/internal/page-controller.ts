/** @internal @packageDocumentation */
import type { ControllerClass } from "@antelopejs/interface-api";
import type { DecoratorTarget } from "@antelopejs/interface-core/decorators";
import { isClass, isFunction, isString } from "../../utils/internal/type-check";

/**
 * A page's metadata whose target is not a controller class: a class built
 * with `Controller(location)` or `PageController(...)`. `GetMetadata` builds
 * page metadata for every link of a class's prototype chain, so the target is
 * typed as any decorator target; a page is only ever declared on a controller.
 */
export class PageTargetError extends TypeError {
  constructor(target: DecoratorTarget) {
    super(
      `A page is declared on a controller class, not on ${target.constructor.name}`,
    );
    this.name = new.target.name;
  }
}

function isControllerClass(target: DecoratorTarget): target is ControllerClass {
  return (
    isClass(target) &&
    "extend" in target &&
    isFunction(target.extend) &&
    "location" in target &&
    isString(target.location)
  );
}

/**
 * The controller class a page's metadata was built for.
 *
 * @throws {PageTargetError} When the target is not a controller class.
 */
export function pageController(target: DecoratorTarget): ControllerClass {
  if (isControllerClass(target)) return target;
  throw new PageTargetError(target);
}

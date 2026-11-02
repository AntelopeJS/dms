import type {
  Class,
  DecoratorTarget,
} from "@antelopejs/interface-core/decorators";

import { isClass } from "./type-check";

/**
 * The class a member decorator decorates: its target's `constructor`.
 *
 * @internal
 */
export function decoratedClass(target: DecoratorTarget): Class {
  const owner = target.constructor;
  if (!isClass(owner)) {
    throw new TypeError("A member decorator applies to a class.");
  }
  return owner;
}

function isDecoratorTarget(value: unknown): value is DecoratorTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    "constructor" in value &&
    typeof value.constructor === "function"
  );
}

/**
 * The prototype a class's instance members are decorated on.
 *
 * @internal
 * @throws {TypeError} When the class has no prototype object.
 */
export function prototypeOf(owner: Class): DecoratorTarget {
  const prototype: unknown = owner.prototype;
  if (!isDecoratorTarget(prototype)) {
    throw new TypeError(`${owner.name} has no prototype to decorate`);
  }
  return prototype;
}

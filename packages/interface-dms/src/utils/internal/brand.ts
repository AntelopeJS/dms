import { isObject } from "./type-check";

/**
 * Brands the prototype of `type` and returns the guard that tests for the brand.
 *
 * The brand is a `Symbol.for` key, so instances of `type`, of its subclasses
 * and of objects whose prototype chain reaches one of them pass the guard,
 * including those built by another copy of this package, where `instanceof`
 * answers false.
 *
 * @param type The class whose instances carry the brand
 * @param name The class name, unique within this package
 * @returns The guard for instances of `type`
 * @internal
 */
export function brandClass<Instance extends object>(
  type: abstract new (...args: never[]) => Instance,
  name: string,
): <T>(value: T) => value is T & Instance {
  const brand = Symbol.for(`@antelopejs/interface-dms/${name}`);
  Object.defineProperty(type.prototype, brand, { value: true });
  return <T>(value: T): value is T & Instance => {
    let current: unknown = value;
    while (isObject(current) && current !== null) {
      if (Object.getOwnPropertyDescriptor(current, brand)?.value === true)
        return true;
      current = Object.getPrototypeOf(current);
    }
    return false;
  };
}

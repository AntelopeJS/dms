/** @internal */
import type {
  ChildSerialized,
  ComponentAnchor,
  ComponentInfo,
  ComponentInfoPromise,
  ComponentInfoSerialized,
} from "../component";
import { isString } from "../utils/internal/type-check";

/** @internal */
export function normalizeComponentAnchor(
  anchor: ComponentAnchor,
): readonly string[] {
  return isString(anchor) ? anchor.split(".") : [...anchor];
}

/** @internal */
export async function serializedInfo<T>(
  componentInfo: Awaited<ComponentInfoPromise<T>>,
  options: T | undefined,
): Promise<ComponentInfoSerialized<T>> {
  const children = componentInfo.children
    ? await Promise.all(componentInfo.children.map(serializeChild))
    : undefined;
  return { ...componentInfo, options, children: children ?? [] };
}

async function serializeChild(
  child: NonNullable<Awaited<ComponentInfoPromise>["children"]>[number],
): Promise<ChildSerialized> {
  const { id, component, ...additionalProps } = child;
  return {
    id,
    component: await component.serialize(),
    ...additionalProps,
  };
}

/** @internal */
export function serializeInfoSync<T>(
  info: ComponentInfoPromise<T>,
): ComponentInfoSerialized<T> {
  // SAFETY: Every Component is a ComponentBuilder, whose componentInfo getter answers the synchronous ComponentInfo builderInfo builds; the package constructs no Component from a promise.
  const componentInfo = info as ComponentInfo<T>;
  if (componentInfo.children) {
    const serializedChildren = componentInfo.children.map((child) => {
      const { id, component, ...additionalProps } = child;
      return {
        id,
        component: component.serializeSync(),
        ...additionalProps,
      };
    });
    return { ...componentInfo, children: serializedChildren };
  }
  return { ...componentInfo, children: [] };
}

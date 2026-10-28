/** @internal */
import type {
  ChildSerialized,
  ComponentAnchor,
  ComponentInfo,
  ComponentInfoPromise,
  ComponentInfoSerialized,
} from "../component";

/** @internal */
export function normalizeComponentAnchor(
  anchor: ComponentAnchor,
): readonly string[] {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Published anchors accept either a dotted string or an ordered segment array.
  return typeof anchor === "string" ? anchor.split(".") : [...anchor];
}

/** @internal */
export function serializedInfo<T>(
  componentInfo: Awaited<ComponentInfoPromise<T>>,
  options: T | undefined,
  children: ChildSerialized[] | undefined,
): ComponentInfoSerialized<T> {
  return { ...componentInfo, options, children: children ?? [] };
}

/** @internal */
export async function serializeChild(
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
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The synchronous API intentionally reads componentInfo without awaiting it; rejecting asynchronous input would change its existing behavior.
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

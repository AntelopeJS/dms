/**
 * The children of a layout block (a Card, a VStack, a Grid) as
 * `RecursiveComponent` draws them: each child's component resolved by its
 * registered name, a `div` when none matches, its own children likewise.
 */
export function resolveComponentChildren(
  children: ComponentChild[],
): ResolvedComponentInfo[] {
  return children.map((child) => {
    const { id, component, ...additionalProps } = child;
    return {
      id,
      options: component.options,
      component: component.componentName
        ? resolveDmsComponent(component.componentName) || "div"
        : "div",
      componentName: component.componentName,
      children: component.children
        ? resolveComponentChildren(component.children)
        : [],
      ...additionalProps,
    };
  });
}

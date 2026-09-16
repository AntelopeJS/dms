import {
  type BaseComponentChild,
  type Component,
  type ComponentInfo,
  ComponentTarget,
  type ComponentTargetInput,
} from "../component";

/** A component and its resolved position under a page's static root field. */
export interface ResolvedComponentTarget {
  rootKey: string;
  path: readonly string[];
  component: Component;
  parent?: Component;
}

/** Read children that are available synchronously during page registration. */
export function getDeclaredComponentChildren(
  component: Component,
): BaseComponentChild[] {
  const info = component.componentInfo;
  if (!info || typeof (info as Promise<unknown>).then === "function") return [];
  return (
    (info as ComponentInfo<unknown, Component, BaseComponentChild>).children ??
    []
  );
}

function targetParts(target: ComponentTargetInput): ComponentTarget {
  return target instanceof ComponentTarget
    ? target
    : new ComponentTarget(target, []);
}

interface ResolvedDescendant {
  component: Component;
  parent?: Component;
}

function resolveDescendant(
  root: Component,
  path: readonly string[],
): ResolvedDescendant | undefined {
  let component = root;
  let parent: Component | undefined;
  for (const id of path) {
    const child = getDeclaredComponentChildren(component).find(
      (entry) => entry.id === id,
    );
    if (!child) return undefined;
    parent = component;
    component = child.component;
  }
  return { component, parent };
}

/** Resolve and validate a target against a page's static root components. */
export function resolveComponentTarget(
  target: ComponentTargetInput,
  roots: Map<string, Component>,
): ResolvedComponentTarget | undefined {
  const { root, path } = targetParts(target);
  const rootEntry = [...roots].find(([, component]) => component === root);
  if (!rootEntry) return undefined;
  const descendant = resolveDescendant(root, path);
  if (!descendant) return undefined;
  return { rootKey: rootEntry[0], path, ...descendant };
}

/** Whether a component already declares a child with the given id. */
export function componentDeclaresChild(
  component: Component,
  id: string,
): boolean {
  return getDeclaredComponentChildren(component).some(
    (child) => child.id === id,
  );
}

/** Build the id assigned by the recursive frontend component renderer. */
export function componentTargetClientId(
  target: ResolvedComponentTarget,
): string {
  return [target.rootKey, ...target.path.map((id) => `child-${id}`)].join("-");
}

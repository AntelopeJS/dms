import { camelize, type Component } from "vue";
import { isFunction, isObject, isString } from "#dms-core/app/utils/type-check";

/** What a form field control offers the field component it renders. */
export interface FieldControlOffer {
  initialValue: unknown;
  loading: boolean;
  componentId: string;
  pageId: string;
  routeParams: Record<string, string> | undefined;
}

function isComponentOptions(
  value: unknown,
): value is Record<string, unknown> | ((...args: never[]) => unknown) {
  return (isObject(value) && value !== null) || isFunction(value);
}

function ownPropNames(props: unknown): string[] {
  if (Array.isArray(props)) return props.filter(isString);
  return isObject(props) && props !== null ? Object.keys(props) : [];
}

/**
 * The props `component` declares, those of its `extends` and `mixins`
 * included, camelized as Vue matches them.
 */
function declaredProps(component: unknown, names = new Set<string>()) {
  if (!isComponentOptions(component)) return names;
  const props = "props" in component ? component.props : undefined;
  for (const name of ownPropNames(props)) names.add(camelize(name));
  if ("extends" in component) declaredProps(component.extends, names);
  const mixins = "mixins" in component ? component.mixins : undefined;
  if (Array.isArray(mixins))
    for (const mixin of mixins) declaredProps(mixin, names);
  return names;
}

/**
 * The component `component` renders: what an async wrapper loads, or the
 * component itself. A loader that fails yields nothing, and the wrapper shows
 * its own failure.
 */
async function loadedComponent(component: Component): Promise<unknown> {
  const loader =
    "__asyncLoader" in component ? component.__asyncLoader : undefined;
  if (!isFunction(loader)) return component;
  try {
    return await loader();
  } catch {
    return undefined;
  }
}

/** The props a field component declares, by the component it was read from. */
export interface DeclaredFieldProps {
  component: Component | string | null;
  names: Set<string>;
}

/**
 * The names of the props `component` declares, read once it is loaded. A
 * component the registry does not resolve, a bare tag name, declares none.
 */
export async function loadDeclaredProps(
  component: Component | string | null,
): Promise<DeclaredFieldProps> {
  if (!component || isString(component)) return { component, names: new Set() };
  return {
    component,
    names: declaredProps(await loadedComponent(component)),
  };
}

/** `offer`, kept to the entries `declared` names. */
export function declaredOffer(
  offer: FieldControlOffer,
  declared: Set<string>,
): Partial<FieldControlOffer> {
  return Object.fromEntries(
    Object.entries(offer).filter(([name]) => declared.has(name)),
  );
}

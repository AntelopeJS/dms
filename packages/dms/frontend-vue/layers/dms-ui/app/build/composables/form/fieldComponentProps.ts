import {
  camelize,
  computed,
  shallowRef,
  watch,
  type Component,
  type Ref,
} from "vue";
import { isFunction, isObject, isString } from "#dms-core/app/utils/type-check";

/** What a form field control offers the field component it renders. */
interface FieldControlOffer {
  initialValue: unknown;
  loading: boolean;
  componentId: string;
  pageId: string;
  routeParams: Record<string, string> | undefined;
}

/** The members of a component that declare props: its own, those of its `extends` and of its `mixins`. */
interface ComponentDeclaration {
  props?: unknown;
  extends?: unknown;
  mixins?: unknown;
}

function isComponentDeclaration(value: unknown): value is ComponentDeclaration {
  if (!isFunction(value) && !(isObject(value) && value !== null)) return false;
  return "props" in value || "extends" in value || "mixins" in value;
}

function ownPropNames(props: unknown): string[] {
  if (Array.isArray(props)) return props.filter(isString);
  return isObject(props) && props !== null ? Object.keys(props) : [];
}

function declarationOf(
  component: Component | ComponentDeclaration,
): ComponentDeclaration {
  return {
    props: "props" in component ? component.props : undefined,
    extends: "extends" in component ? component.extends : undefined,
    mixins: "mixins" in component ? component.mixins : undefined,
  };
}

/**
 * The props `component` declares, those of its `extends` and `mixins`
 * included, camelized as Vue matches them.
 */
function declaredProps(
  component: Component | ComponentDeclaration | undefined,
  names = new Set<string>(),
) {
  if (!component) return names;
  const declaration = declarationOf(component);
  for (const name of ownPropNames(declaration.props)) names.add(camelize(name));
  if (isComponentDeclaration(declaration.extends))
    declaredProps(declaration.extends, names);
  const { mixins } = declaration;
  if (Array.isArray(mixins))
    for (const mixin of mixins)
      if (isComponentDeclaration(mixin)) declaredProps(mixin, names);
  return names;
}

/**
 * The component `component` renders: what an async wrapper loads, or the
 * component itself. A loader that fails yields nothing, and the wrapper shows
 * its own failure.
 */
async function loadedComponent(
  component: Component,
): Promise<Component | ComponentDeclaration | undefined> {
  const loader: unknown =
    "__asyncLoader" in component ? component.__asyncLoader : undefined;
  if (!isFunction(loader)) return component;
  try {
    const loaded = await loader();
    return isComponentDeclaration(loaded) ? loaded : undefined;
  } catch {
    return undefined;
  }
}

/** The props a field component declares, by the component it was read from. */
interface DeclaredFieldProps {
  component: Component | string | null;
  names: Set<string>;
}

/**
 * The names of the props `component` declares, read once it is loaded. A
 * component the registry does not resolve, a bare tag name, declares none.
 */
async function loadDeclaredProps(
  component: Component | string | null,
): Promise<DeclaredFieldProps> {
  if (!component || isString(component)) return { component, names: new Set() };
  return {
    component,
    names: declaredProps(await loadedComponent(component)),
  };
}

/**
 * Follows the props the field component `rendered` declares, `null` while
 * none renders. Await it in `setup`: it settles once the first component is
 * read, so that component's first render gets what it declares. `isReady`
 * stays false while a newer component is read.
 */
export async function useDeclaredFieldProps(
  rendered: Ref<Component | string | null>,
) {
  const declared = shallowRef<DeclaredFieldProps>();
  let latest = 0;
  const read = async (target: Component | string | null): Promise<void> => {
    latest += 1;
    const request = latest;
    const loaded = await loadDeclaredProps(target);
    if (request === latest) declared.value = loaded;
  };
  watch(rendered, read);
  const isReady = computed(
    () => !!declared.value && declared.value.component === rendered.value,
  );
  const offer = (
    offered: Partial<FieldControlOffer>,
  ): Partial<FieldControlOffer> => {
    const names = declared.value?.names;
    return Object.fromEntries(
      Object.entries(offered).filter(([name]) => names?.has(name)),
    );
  };
  await read(rendered.value);
  return { isReady, offer };
}

import { camelize, capitalize, type Component } from "vue";

function normalizeComponentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findRegistryKey(
  name: string,
  components: Record<string, Component>,
): string | undefined {
  if (components[name]) return name;

  const pascal = capitalize(camelize(name));
  if (components[pascal]) return pascal;

  const normalized = normalizeComponentName(name);
  for (const key of Object.keys(components)) {
    if (normalizeComponentName(key) === normalized) {
      return key;
    }
  }

  return undefined;
}

/**
 * Resolve a DMS component by name from the Vue app's global registry.
 * All frontend module components are registered globally as lazy async chunks,
 * so this only returns a loader reference — the component code is fetched
 * when it first renders. Lookup tolerates PascalCase, kebab-case and
 * lowercase variants, matching what backend data may contain.
 */
export function resolveDmsComponent(name?: string): Component | undefined {
  if (!name) return undefined;

  // _context is a private Vue API, but it is the only runtime view of the
  // global registry; the DMS preloader reads it the same way.
  const components = useDmsApp().vueApp._context.components;
  const key = findRegistryKey(name, components);

  if (!key && import.meta.env.DEV) {
    console.warn(
      `[resolveDmsComponent] No globally registered component matches "${name}". ` +
        "Check the componentName sent by the backend and that the component's " +
        "directory is declared with global: true.",
    );
  }

  return key ? components[key] : undefined;
}

/**
 * Resolve the canonical registered name of a DMS component. The DMS app's
 * preloadComponents()/prefetchComponents() look components up by their exact
 * registered name, so backend-provided variants must go through this first.
 */
export function resolveDmsComponentName(name?: string): string | undefined {
  if (!name) return undefined;

  return findRegistryKey(name, useDmsApp().vueApp._context.components);
}

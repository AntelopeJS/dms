import { camelize, capitalize, type Component } from "vue";
import { resolveDmsComponent as resolveRegisteredComponent } from "#dms/frontend-module";
import { usePageModule } from "../build/composables/page/pageModule";

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
 * Resolve a DMS component by name through the frontend engine's registry, as
 * a lazy loader: the component code is fetched when it first renders. Names
 * are compared normalized (a leading `lazy` or `dms` and every
 * non-alphanumeric character dropped, case ignored), so PascalCase,
 * kebab-case and lowercase variants from backend data all match. The private
 * components of the module owning the page on screen resolve too, ahead of a
 * public component of the same name.
 */
export function resolveDmsComponent(name?: string): Component | undefined {
  if (!name) return undefined;

  const component = resolveRegisteredComponent(name, usePageModule().value);

  if (!component && import.meta.env.DEV) {
    console.warn(
      `[resolveDmsComponent] No registered component matches "${name}". ` +
        "Check the componentName sent by the backend and the name the " +
        "frontend module registers it under.",
    );
  }

  return component;
}

/**
 * Resolve the canonical registered name of a public DMS component in the Vue
 * app's global registry, for APIs that take an exact registered name.
 * Private components are not global and have no such name.
 */
export function resolveDmsComponentName(name?: string): string | undefined {
  if (!name) return undefined;

  return findRegistryKey(name, useDmsApp().vueApp._context.components);
}

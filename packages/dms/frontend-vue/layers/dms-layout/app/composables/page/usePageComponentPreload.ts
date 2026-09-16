function collectFromComponentInfo(
  info: ComponentInfo | undefined,
  names: Set<string>,
): void {
  if (!info) return;
  if (info.componentName) {
    names.add(info.componentName);
  }
  for (const child of info.children || []) {
    collectFromComponentInfo(child.component, names);
  }
}

/**
 * Collect every componentName referenced by a page layout: the layout
 * component itself, the top-level components and all their nested children.
 */
export function collectPageLayoutComponentNames(
  layout: PageLayout | null | undefined,
): string[] {
  if (!layout) return [];

  const names = new Set<string>();
  collectFromComponentInfo(layout.layout, names);
  for (const info of Object.values(layout.components || {})) {
    collectFromComponentInfo(info, names);
  }
  return [...names];
}

function toCanonicalNames(layout: PageLayout | null | undefined): string[] {
  return collectPageLayoutComponentNames(layout)
    .map((name) => resolveDmsComponentName(name))
    .filter((name): name is string => !!name);
}

/**
 * Start fetching the chunks of every component a page layout references,
 * in parallel, instead of letting each <Component :is> trigger its own
 * fetch when it mounts (which waterfalls for nested children).
 * No-op on the server: SSR resolves async components during render.
 */
export function preloadPageLayoutComponents(
  layout: PageLayout | null | undefined,
): void {
  if (import.meta.env.SSR) return;

  const names = toCanonicalNames(layout);
  if (names.length) {
    preloadComponents(names).catch(() => {});
  }
}

/**
 * Same as preloadPageLayoutComponents, for speculative loading (e.g. link
 * hover) where the user may never navigate to the page.
 */
export function prefetchPageLayoutComponents(
  layout: PageLayout | null | undefined,
): void {
  if (import.meta.env.SSR) return;

  const names = toCanonicalNames(layout);
  if (names.length) {
    prefetchComponents(names)?.catch(() => {});
  }
}

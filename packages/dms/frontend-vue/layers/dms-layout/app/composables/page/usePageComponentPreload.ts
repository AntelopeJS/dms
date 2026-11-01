import type { AsyncComponentLoader } from "vue";

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
 * Collect every componentName referenced by a page layout: the top-level
 * components and all their nested children, and the children of the layout
 * component. The layout component itself is a layout the frontend modules
 * register apart from components (`registerLayout`), which the renderer
 * loads with the page: looked up among the components, it is not found.
 */
export function collectPageLayoutComponentNames(
  layout: PageLayout | null | undefined,
): string[] {
  if (!layout) return [];

  const names = new Set<string>();
  for (const child of layout.layout?.children || []) {
    collectFromComponentInfo(child.component, names);
  }
  for (const info of Object.values(layout.components || {})) {
    collectFromComponentInfo(info, names);
  }
  return [...names];
}

interface AsyncComponentWithLoader {
  __asyncLoader?: AsyncComponentLoader;
}

function loadPageLayoutComponents(layout: PageLayout | null | undefined) {
  return Promise.all(
    collectPageLayoutComponentNames(layout).map((name) => {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- resolveDmsComponent exposes Vue's public Component union, not its optional internal loader; the loader's callable type comes from Vue and access remains unchecked for custom components.
      const component = resolveDmsComponent(name) as
        | AsyncComponentWithLoader
        | undefined;
      return component?.__asyncLoader?.();
    }),
  );
}

export const PAGE_COMPONENTS_WAIT_MS = 3_000;

/**
 * Start fetching the chunks of every component a page layout references,
 * in parallel, instead of letting each <Component :is> trigger its own
 * fetch when it mounts (which waterfalls for nested children).
 * No-op on the server: SSR resolves async components during render.
 *
 * Settles once they are all in, or failed, or after
 * `PAGE_COMPONENTS_WAIT_MS`: the page's setup awaits it, so a client
 * navigation shows the page with its blocks' code there. A lazy block
 * renders nothing until its chunk lands, then pushes the page down and
 * draws its skeleton again.
 */
export function preloadPageLayoutComponents(
  layout: PageLayout | null | undefined,
): Promise<void> {
  if (import.meta.env.SSR) return Promise.resolve();

  const loaded = loadPageLayoutComponents(layout).then(
    () => {},
    () => {},
  );
  return Promise.race([
    loaded,
    new Promise<void>((resolve) =>
      setTimeout(resolve, PAGE_COMPONENTS_WAIT_MS),
    ),
  ]);
}

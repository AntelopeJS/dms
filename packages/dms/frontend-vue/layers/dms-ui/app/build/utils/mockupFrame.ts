import { isPreviewTheme, type PreviewNode } from "./blockPreview";
import {
  previewRenderMessage,
  type PreviewNavigation,
  type PreviewRenderMessage,
  type PreviewSidebarWidget,
} from "./blockPreviewMessages";
import type {
  MockupCategory,
  MockupPageState,
  MockupSidebarWidget,
} from "./mockup";
import { groupSections } from "./mockupSections";
import type { PreviewPageStatus } from "./previewPageStatus";
import { currentSketchScheme } from "./sketch";

const HOME_ICON = "i-ph-house-light";
/** What the preview's sidebar draws for a page without an icon. */
const PAGE_ICON = "i-ph-file-light";

/**
 * The height, in the frame's own pixels, at which a page fills a canvas that
 * shows `visible` pixels of it at `scale`. Rounded down, so the shrunk frame
 * never overflows the canvas and raises a scrollbar of its own.
 */
export function fillingHeight(visible: number, scale: number): number {
  if (visible <= 0 || scale <= 0) return 0;
  return Math.floor(visible / scale);
}

/**
 * The icon the preview's sidebar gets for the page at `index`: its own, else
 * a house for the first page; none for another page, which the sidebar draws
 * as a file.
 */
function sidebarIcon(
  page: Pick<MockupPageState, "icon">,
  index: number,
): string | undefined {
  return page.icon ?? (index === 0 ? HOME_ICON : undefined);
}

/** The icon the page at `index` shows, in the preview's sidebar and above its Overview frame. */
export function mockupPageIcon(
  page: Pick<MockupPageState, "icon">,
  index: number,
): string {
  return sidebarIcon(page, index) ?? PAGE_ICON;
}

type NavigationPage = Pick<
  MockupPageState,
  "id" | "title" | "icon" | "category" | "menu" | "parent" | "livePage" | "live"
>;

/**
 * What a page is beside the live app: a live reference page is `live`, a
 * page converted from a live page `edited`, any other `new`.
 */
export function mockupPageStatus(
  page: Pick<MockupPageState, "live" | "livePage">,
): PreviewPageStatus {
  if (page.live) return "live";
  return page.livePage ? "edited" : "new";
}

/** Whether a mockup stands for the whole platform: it holds a live reference page. */
export function isWholeAppMockup(
  pages: readonly Pick<MockupPageState, "live">[],
): boolean {
  return pages.some((page) => page.live !== undefined);
}

/**
 * The titles of the pages a whole-platform mockup builds, in the spec's
 * order: its edited and new pages, never a live reference page, which
 * stands for its live page untouched. Undefined for any other mockup.
 */
export function pagesToBuild(
  pages: readonly Pick<MockupPageState, "title" | "live" | "generated">[],
): string[] | undefined {
  if (!isWholeAppMockup(pages)) return undefined;
  return pages.flatMap((page) =>
    page.live || page.generated ? [] : [`"${page.title}"`],
  );
}

/** What the preview's sidebar lists of a mockup. */
export interface MockupNavigationSource {
  title: string;
  categories: readonly MockupCategory[];
  pages: readonly NavigationPage[];
  /** The page drawn as the current one. */
  active: string | undefined;
  /** Whether the sidebar edits its sections. */
  editable?: boolean;
  /** Sketches the sidebar draws among its widgets. */
  widgets?: readonly MockupSidebarWidget[];
}

function sidebarWidget(widget: MockupSidebarWidget): PreviewSidebarWidget {
  return {
    id: widget.id,
    html: widget.html,
    height: widget.height,
    ...(widget.css !== undefined && { css: widget.css }),
    ...(widget.title !== undefined && { caption: widget.title }),
  };
}

/**
 * The entry of the sidebar that stands for the page `id`: its own, else its
 * nearest parent's that the sidebar lists, as the dashboard keeps a list's
 * entry lit on its detail page.
 */
function menuEntryOf(
  pages: readonly NavigationPage[],
  id: string | undefined,
): string | undefined {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const seen = new Set<string>();
  for (let at = id; at !== undefined && !seen.has(at); ) {
    const page = byId.get(at);
    if (!page) return undefined;
    if (page.menu !== false) return page.id;
    seen.add(at);
    at = page.parent;
  }
  return undefined;
}

/**
 * The mockup's pages as the preview's sidebar lists them: under their
 * sections, each page with its icon and the route of the live page it was
 * converted from, and `active` as the current one. A page with `menu: false`
 * is left out, and while it is the current one, its nearest listed parent is.
 * The mockup's sidebar widgets follow, each `title` the caption over it. A
 * whole-platform mockup's sidebar is its own menu, each page with its
 * {@link mockupPageStatus}.
 */
export function mockupNavigation(
  source: MockupNavigationSource,
): PreviewNavigation {
  const indexed = source.pages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => page.menu !== false);
  const sections = groupSections(
    source.categories,
    indexed,
    ({ page }) => page.category,
  );
  const wholeApp = isWholeAppMockup(source.pages);
  return {
    title: source.title,
    sections: sections.map((section) => ({
      ...(section.category && { category: section.category }),
      items: section.pages.map(({ page, index }) => ({
        id: page.id,
        label: page.title,
        icon: sidebarIcon(page, index),
        ...(page.livePage && { livePage: page.livePage.ref }),
        ...(wholeApp && { status: mockupPageStatus(page) }),
      })),
    })),
    active: menuEntryOf(source.pages, source.active),
    ...(source.editable && { editable: true }),
    ...(wholeApp && { wholeApp: true }),
    ...(source.widgets &&
      source.widgets.length > 0 && {
        widgets: source.widgets.map(sidebarWidget),
      }),
  };
}

/**
 * What the preview draws for a page of the mockup: `tree`, the page's own or
 * its live one, in the page's theme, else the dashboard's, and its locale,
 * inside `navigation`, under the page header its spec writes, its blocks'
 * `{{params.X}}` tokens filled with `params`.
 */
export function mockupPageRender(
  page: MockupPageState,
  tree: PreviewNode[],
  navigation: PreviewNavigation,
  params?: Record<string, string>,
): PreviewRenderMessage {
  return previewRenderMessage({
    ...(params && { params }),
    tree,
    theme: isPreviewTheme(page.options.theme)
      ? page.options.theme
      : currentSketchScheme(),
    locale: page.options.locale,
    padding: page.options.padding ?? true,
    navigation,
    ...(page.live && { live: page.live.ref }),
    header: {
      title: page.title,
      icon: page.icon,
      description: page.description,
      actions: page.headerActions,
      ...(navigation.wholeApp && { status: mockupPageStatus(page) }),
    },
  });
}

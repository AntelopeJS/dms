import { z } from "zod";

/**
 * The slice of a mounted Vue app the probe reads: a vnode tree whose
 * component instances expose their props. A `RecursiveComponent` draws each
 * block of a page or a preview, and holds its `layoutPath`, `componentId`
 * and `pageId` props.
 */
interface VueVNode {
  el?: Node | null;
  component?: {
    props: {
      layoutPath?: string;
      componentId?: string;
      pageId?: string;
      component?: {
        componentName?: string;
        options?: { issue?: { key?: string } };
      };
    };
    subTree?: VueVNode;
  } | null;
  children?: VueVNode[] | string | null;
  suspense?: { activeBranch?: VueVNode | null } | null;
}

declare global {
  interface Element {
    /** Set by Vue on the element an app is mounted on. */
    __vue_app__?: { _instance?: { subTree?: VueVNode } | null };
  }
}

const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/** A box in page coordinates: scrolled content included. */
export type PageRect = z.infer<typeof RectSchema>;

const ProbedBlockSchema = z.object({
  path: z.string(),
  componentName: z.string().optional(),
  /** The preview notice drawn in place of the block, such as `needs_backend`. */
  issue: z.string().optional(),
  rect: RectSchema.nullable(),
});

/** One block a `RecursiveComponent` drew, found by its layout path. */
export type ProbedBlock = z.infer<typeof ProbedBlockSchema>;

const ProbeSchema = z.object({
  blocks: z.array(ProbedBlockSchema),
  viewportWidth: z.number(),
  documentWidth: z.number(),
  dataBlocks: z.array(
    z.object({ path: z.string(), type: z.string(), state: z.string() }),
  ),
});

/** What the page shows once it has settled. */
export type PageProbe = z.infer<typeof ProbeSchema>;

/**
 * Runs in the page: Playwright sends its source, so it reads nothing from
 * this module. Walks every mounted Vue app for the `RecursiveComponent`
 * instances, measures the first element each draws (as the dashboard's
 * block anchors do) and marks it with the block's layout path for
 * {@link blockSelector}.
 */
function probeInPage(): PageProbe {
  const MARK = "data-page-verify-path";
  const firstElement = (vnode: VueVNode | null | undefined): Element | null => {
    if (!vnode) return null;
    if (vnode.el instanceof Element) return vnode.el;
    if (vnode.component) return firstElement(vnode.component.subTree);
    if (!Array.isArray(vnode.children)) return null;
    for (const child of vnode.children) {
      const found = firstElement(child);
      if (found) return found;
    }
    return null;
  };
  const toPage = (element: Element | null): PageRect | null => {
    const rect = element?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0
      ? {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height,
        }
      : null;
  };
  const blocks: ProbedBlock[] = [];
  const mark = (element: Element, path: string): void => {
    const marked = element.getAttribute(MARK);
    element.setAttribute(MARK, marked ? `${marked} ${path}` : path);
  };
  const visit = (vnode: VueVNode | null | undefined): void => {
    if (!vnode) return;
    const instance = vnode.component;
    if (instance) {
      const { layoutPath, componentId, pageId, component } = instance.props;
      if (
        layoutPath !== undefined &&
        componentId !== undefined &&
        pageId !== undefined
      ) {
        const element = firstElement(instance.subTree);
        if (element) mark(element, layoutPath);
        blocks.push({
          path: layoutPath,
          componentName: component?.componentName,
          issue: component?.options?.issue?.key,
          rect: toPage(element),
        });
      }
      visit(instance.subTree);
      return;
    }
    visit(vnode.suspense?.activeBranch);
    if (Array.isArray(vnode.children)) vnode.children.forEach(visit);
  };
  for (const element of document.querySelectorAll(`[${MARK}]`)) {
    element.removeAttribute(MARK);
  }
  for (const root of document.querySelectorAll(
    "[data-v-app], [data-server-rendered]",
  )) {
    visit(root.__vue_app__?._instance?.subTree);
  }
  return {
    blocks,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    dataBlocks: [...document.querySelectorAll("[data-dms-block-state]")].map(
      (element) => ({
        path: element.getAttribute("data-dms-block") ?? "",
        type: element.getAttribute("data-dms-block-type") ?? "",
        state: element.getAttribute("data-dms-block-state") ?? "",
      }),
    ),
  };
}

/**
 * The selector of the element a probe found for a block: the probe marks
 * each block's first element with its layout paths, space-separated, since
 * a block can draw its first child's element as its own.
 */
export function blockSelector(path: string): string {
  return `[data-page-verify-path~=${JSON.stringify(path)}]`;
}

/** Something Playwright can evaluate a function in: a page or a frame. */
export interface Evaluates {
  evaluate<R>(fn: () => R): Promise<R>;
}

/**
 * Measures every block and reads every data state the page shows. The
 * answer crosses from the page, so it is parsed on arrival.
 */
export async function probePage(target: Evaluates): Promise<PageProbe> {
  return ProbeSchema.parse(await target.evaluate(probeInPage));
}

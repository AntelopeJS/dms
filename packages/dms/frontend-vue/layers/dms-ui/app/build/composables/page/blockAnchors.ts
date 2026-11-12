import { isVNode, type ComponentPublicInstance, type VNode } from "vue";

const blocks = new Map<string, ComponentPublicInstance>();

/**
 * Records the block drawn under `anchor`, or forgets it once unmounted
 * (`instance` is `null`). A block drawn again under the same anchor (a
 * drawer showing the same page) takes it over until it unmounts.
 *
 * @internal
 */
export function registerBlockAnchor(
  anchor: string | undefined,
  instance: ComponentPublicInstance | null,
  previous?: ComponentPublicInstance | null,
): void {
  if (!anchor) return;
  if (instance) {
    blocks.set(anchor, instance);
    return;
  }
  if (!previous || blocks.get(anchor) === previous) blocks.delete(anchor);
}

function firstElementOf(vnode: VNode | null | undefined): Element | null {
  if (!vnode) return null;
  if (vnode.el instanceof Element) return vnode.el;
  if (vnode.component) return firstElementOf(vnode.component.subTree);
  if (!Array.isArray(vnode.children)) return null;
  for (const child of vnode.children) {
    const element = isVNode(child) ? firstElementOf(child) : null;
    if (element) return element;
  }
  return null;
}

/**
 * The first element the block drawn under `anchor` renders, `null` when no
 * such block is on screen (an unknown key, a closed tab, a hidden block).
 *
 * @internal
 */
export function blockAnchorElement(anchor: string): Element | null {
  const instance = blocks.get(anchor);
  return instance ? firstElementOf(instance.$.subTree) : null;
}

function topElementsOf(vnode: VNode | null | undefined): Element[] {
  if (!vnode) return [];
  if (vnode.el instanceof Element) return [vnode.el];
  if (vnode.component) return topElementsOf(vnode.component.subTree);
  if (!Array.isArray(vnode.children)) return [];
  return vnode.children.flatMap((child) =>
    isVNode(child) ? topElementsOf(child) : [],
  );
}

function elementsOfBlock(instance: ComponentPublicInstance): Element[] {
  return instance instanceof Element
    ? [instance]
    : topElementsOf(instance.$.subTree);
}

/**
 * Every top-level element the block drawn under `anchor` renders: more than
 * one for a block whose template has several roots. Empty when no such block
 * is on screen.
 *
 * @internal
 */
export function blockAnchorElements(anchor: string): Element[] {
  const instance = blocks.get(anchor);
  return instance ? elementsOfBlock(instance) : [];
}

/**
 * The anchor of the innermost block whose elements hold `target`, `undefined`
 * when none does. A child's anchor extends its parent's, so the longest
 * anchor among the blocks holding `target` is the innermost one.
 *
 * @internal
 */
export function blockAnchorAt(target: EventTarget | null): string | undefined {
  if (!(target instanceof Node)) return undefined;
  let innermost: string | undefined;
  for (const [anchor, instance] of blocks) {
    const holdsTarget = elementsOfBlock(instance).some((element) =>
      element.contains(target),
    );
    if (holdsTarget && anchor.length > (innermost?.length ?? -1)) {
      innermost = anchor;
    }
  }
  return innermost;
}

/**
 * The anchor of every block on screen now, in the order they registered.
 *
 * @internal
 */
export function blockAnchorPaths(): string[] {
  return [...blocks.keys()];
}

import type { ComponentPublicInstance, VNode } from "vue";

// The blocks a page draws, by their anchor: the key path `RecursiveComponent`
// renders them under (`summary`, `tabs.statistics`). Registered from a
// template ref, which only runs in the browser, so a server render never
// fills it.
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
    const element = firstElementOf(child as VNode);
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

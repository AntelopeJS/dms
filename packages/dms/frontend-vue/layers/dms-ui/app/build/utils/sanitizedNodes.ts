import { h, type VNodeChild } from "vue";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

/**
 * The children of a DOM node as Vue nodes: its elements with their
 * attributes, and its text. Read from a sanitised fragment, so the page draws
 * what the sanitiser kept without handing a string to `innerHTML`.
 *
 * @internal
 */
export function sanitizedNodes(parent: Node): VNodeChild[] {
  return Array.from(parent.childNodes, (node) => {
    if (isElement(node)) {
      const attributes = Object.fromEntries(
        Array.from(node.attributes, ({ name, value }) => [name, value]),
      );
      return h(node.localName, attributes, sanitizedNodes(node));
    }
    return node.nodeType === TEXT_NODE ? node.textContent : null;
  });
}

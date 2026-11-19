import type { JsonValue } from "../../../../dms-core/app/types/json";
import { isString } from "../../../../dms-core/app/utils/type-check";
import {
  PREVIEW_ROOT_ID_PREFIX,
  SKETCH_NODE_TYPE,
  type PreviewChildNode,
  type PreviewNode,
} from "./blockPreview";
import { isWritableObject, type JsonWritable } from "./json";
import type { MockupPageState } from "./mockup";

/**
 * The state each sketch of a page draws, chosen in the viewer, keyed by the
 * sketch's spec pointer, {@link CUSTOM_PAGE_SKETCH} for a custom page's own
 * sketch. A sketch without an entry, or whose states lack the one picked,
 * draws its own `html`.
 */
export type MockupSketchStates = ReadonlyMap<string, string>;

/** The key of a custom page's sketch: the page itself, which no spec pointer of a node names. */
export const CUSTOM_PAGE_SKETCH = "";

/** The layout path of a custom page's sketch: the one root of its tree. */
const CUSTOM_PAGE_PATH = `${PREVIEW_ROOT_ID_PREFIX}0`;

/** The key of the sketch at `layoutPath` of `page` in its states: its spec pointer, or the page's own for a custom page. */
function sketchKey(
  page: Pick<MockupPageState, "paths" | "custom">,
  layoutPath: string,
): string | undefined {
  return page.custom && layoutPath === CUSTOM_PAGE_PATH
    ? CUSTOM_PAGE_SKETCH
    : page.paths[layoutPath];
}

/** The names of the states a sketch's `states` option holds, in its order; none when it holds none. */
export function sketchStateNames(
  states: JsonValue | JsonWritable | undefined,
): string[] {
  if (!isWritableObject(states)) return [];
  return Object.entries(states)
    .filter(([, markup]) => isString(markup))
    .map(([name]) => name);
}

/** `node`, a sketch drawing the markup of its state `state` when it holds one; any other node as it is. */
function drawnIn(
  node: PreviewChildNode,
  state: string | undefined,
): PreviewChildNode {
  const options = node.options;
  if (node.type !== SKETCH_NODE_TYPE || state === undefined || !options) {
    return node;
  }
  const states = options.states;
  const markup = isWritableObject(states) ? states[state] : undefined;
  return isString(markup)
    ? { ...node, options: { ...options, html: markup } }
    : node;
}

function drawnNode(
  node: PreviewChildNode,
  layoutPath: string,
  page: Pick<MockupPageState, "paths" | "custom">,
  states: MockupSketchStates,
): PreviewChildNode {
  const key = sketchKey(page, layoutPath);
  const drawn = drawnIn(node, key === undefined ? undefined : states.get(key));
  if (!drawn.children) return drawn;
  return {
    ...drawn,
    children: drawn.children.map((child, index) =>
      drawnNode(child, `${layoutPath}.${child.id ?? index}`, page, states),
    ),
  };
}

/**
 * `tree`, a compiled tree of `page`, with each sketch drawing the state
 * `states` picks for it in place of its `html`.
 */
export function withSketchStates(
  page: Pick<MockupPageState, "paths" | "custom">,
  tree: readonly PreviewNode[],
  states: MockupSketchStates,
): PreviewNode[] {
  return tree.map((node, index) =>
    drawnNode(node, `${PREVIEW_ROOT_ID_PREFIX}${index}`, page, states),
  );
}

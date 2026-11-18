import { shallowRef } from "vue";
import type { PreviewNode } from "../../utils/blockPreview";
import type { MockupPageState } from "../../utils/mockup";
import {
  withSketchStates,
  type MockupSketchStates,
} from "../../utils/mockupSketchStates";

/** The states the viewer draws its sketches in, which no spec holds. */
export interface MockupSketchStatesChoice {
  /** The state each sketch of the page `page` draws. */
  of: (page: string | undefined) => MockupSketchStates;
  /** Draws the sketch at `pointer` of the page `page` in its state `state`, or in its own `html` when undefined. */
  pick: (page: string, pointer: string, state: string | undefined) => void;
  /** The tree `page` draws, its live one with Real data on, each sketch in the state picked for it. */
  treeOf: (page: MockupPageState, realData: boolean) => PreviewNode[];
}

const NONE: MockupSketchStates = new Map();

/**
 * The state each sketch draws while the viewer is open, picked in the
 * inspector; `onPick` runs after each pick, to draw it. Each page keeps its
 * picks when another page opens.
 */
export function useMockupSketchStates(
  onPick: () => void,
): MockupSketchStatesChoice {
  const picked = shallowRef<ReadonlyMap<string, MockupSketchStates>>(new Map());
  const of = (page: string | undefined) =>
    (page === undefined ? undefined : picked.value.get(page)) ?? NONE;
  return {
    of,
    pick: (page, pointer, state) => {
      const states = new Map(of(page));
      if (state === undefined) states.delete(pointer);
      else states.set(pointer, state);
      picked.value = new Map(picked.value).set(page, states);
      onPick();
    },
    treeOf: (page, realData) =>
      withSketchStates(
        page,
        realData && page.realTree ? page.realTree : page.tree,
        of(page.id),
      ),
  };
}

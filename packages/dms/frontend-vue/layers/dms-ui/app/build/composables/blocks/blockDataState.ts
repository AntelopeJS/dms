import {
  computed,
  inject,
  toValue,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";
import type { ChartSeries } from "../../../composables/chart/types";

/**
 * What a data block shows its reader: still waiting for its first answer
 * (`loading`), content (`ok`), an answer with nothing to draw (`empty`), or a
 * request that failed with nothing to fall back on (`error`).
 */
export type BlockDataState = "loading" | "ok" | "empty" | "error";

/**
 * The attributes a data block carries on its root element. An overlay or a
 * test harness reads them from the DOM, so the names are a contract.
 */
export const BLOCK_ATTRIBUTES = {
  /** The block's position in the page layout: its key, then each child id, joined by dots. */
  path: "data-dms-block",
  /** The block kind as the page author names it, for example `ChartCard`. */
  type: "data-dms-block-type",
  /** A {@link BlockDataState}. */
  state: "data-dms-block-state",
} as const;

/** The layout path of the block being rendered, provided by `RecursiveComponent`. */
export const BLOCK_PATH_KEY: InjectionKey<Ref<string | undefined>> =
  Symbol("dms-block-path");

export interface BlockStateFacts {
  /** An answer for the current inputs is still to come. */
  loading: boolean;
  /** The last request failed. */
  failed: boolean;
  /** The block has something to show its reader. */
  hasContent: boolean;
}

/**
 * The state of a block from three facts. Content wins over everything: a
 * block refreshing or failing a refresh still shows what it had.
 */
export function resolveBlockState(facts: BlockStateFacts): BlockDataState {
  if (facts.hasContent) return "ok";
  if (facts.loading) return "loading";
  if (facts.failed) return "error";
  return "empty";
}

function isDrawable(point: ChartSeries["data"][number]): boolean {
  if (typeof point === "number") return Number.isFinite(point);
  return point.y !== null && point.y !== undefined;
}

/** Whether any series holds a point a chart can draw: not absent, not `null`. */
export function hasDrawablePoints(series: readonly ChartSeries[]): boolean {
  return series.some((entry) => entry.data.some(isDrawable));
}

export type BlockStateAttributes = {
  [BLOCK_ATTRIBUTES.state]: BlockDataState;
  [BLOCK_ATTRIBUTES.type]: string;
  [BLOCK_ATTRIBUTES.path]?: string;
};

/**
 * The attributes to bind on a data block's root element (`v-bind`): its
 * kind, its state, and its layout path when a `RecursiveComponent` renders it.
 */
export function useBlockStateAttributes(
  type: string,
  state: MaybeRefOrGetter<BlockDataState>,
): ComputedRef<BlockStateAttributes> {
  const path = inject(BLOCK_PATH_KEY, null);
  return computed(() => ({
    [BLOCK_ATTRIBUTES.state]: toValue(state),
    [BLOCK_ATTRIBUTES.type]: type,
    [BLOCK_ATTRIBUTES.path]: path?.value,
  }));
}

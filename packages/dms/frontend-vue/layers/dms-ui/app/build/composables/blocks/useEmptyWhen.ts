import { computed, type ComputedRef } from "vue";
import { useChartFetch } from "../../../composables/chart/useChartFetch";
import type { BlockAction } from "../../components/blocks/BlockActions.vue";
import type {
  EmptyStateSize,
  EmptyStateVariant,
} from "../../../components/empty-state/EmptyState.vue";
import type { Tone } from "../../../types/tone";

/** The empty state a container shows in place of its content (an `EmptyState` block's options). */
export interface EmptyWhenState {
  title: string;
  description?: string;
  variant?: EmptyStateVariant;
  icon?: string;
  tone?: Tone;
  hatched?: boolean;
  size?: EmptyStateSize;
  actions?: BlockAction[];
  card?: boolean;
}

/** When a container swaps its content for one empty state (interface-dms `GridEmptyWhen`). */
export interface EmptyWhenOptions {
  fetchUrl: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
  /** Dot path of the value read in the answer. */
  field: string;
  emptyState: EmptyWhenState;
}

/** What the route answers: any object, maybe with an `emptyState` laid over the option's. */
export interface EmptyWhenResponse {
  emptyState?: Partial<EmptyWhenState>;
  [field: string]: unknown;
}

const FIELD_PATH_SEPARATOR = ".";

/** The value at a dot path of an answer, `undefined` where the path stops. */
export function readFieldPath(source: unknown, path: string): unknown {
  return path.split(FIELD_PATH_SEPARATOR).reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

/** Absent, `null`, `false`, `0`, `""` or an empty list: nothing to show. */
export function isEmptyValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return !value;
}

/**
 * The empty state a container shows instead of its content, or `null` while
 * its content shows: while the route loads, after it failed, and whenever the
 * value it names is set. The route is read like a block's `fetchUrl` (URL
 * tokens, period scope, realtime topics, page refresh).
 */
export function useEmptyWhen(
  options: () => EmptyWhenOptions | undefined,
  routeParams: () => Record<string, string> | undefined,
): ComputedRef<EmptyWhenState | null> {
  const initial = options();
  const { data } = useChartFetch<EmptyWhenResponse>({
    fetchUrl: initial?.fetchUrl,
    fetchUrlMethod: initial?.fetchUrlMethod,
    periodScope: initial?.periodScope,
    realtimeTopic: initial?.realtimeTopic,
    routeParams,
  });

  return computed(() => {
    const current = options();
    const answer = data.value;
    if (!current || !answer) return null;
    if (!isEmptyValue(readFieldPath(answer, current.field))) return null;
    return { ...current.emptyState, ...answer.emptyState };
  });
}

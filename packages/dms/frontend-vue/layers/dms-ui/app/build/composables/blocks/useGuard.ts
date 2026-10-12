import { computed, type ComputedRef } from "vue";
import { useChartFetch } from "../../../composables/chart/useChartFetch";
import {
  type FetchNotFound,
  readFetchNotFound,
} from "../../utils/fetchNotFound";
import type { BlockAction } from "../../components/blocks/BlockActions.vue";
import type {
  EmptyStateSize,
  EmptyStateVariant,
} from "../../../components/empty-state/EmptyState.vue";
import type { Tone } from "../../../types/tone";

/** The empty state a guard shows in place of its children (interface-dms `GuardFallback`). */
export interface GuardFallback {
  title?: string;
  description?: string;
  variant?: EmptyStateVariant;
  icon?: string;
  tone?: Tone;
  hatched?: boolean;
  size?: EmptyStateSize;
  actions?: BlockAction[];
  code?: { content: string; language?: string; copy?: boolean };
  card?: boolean;
}

/** What a guard checks its route for (interface-dms `GuardCondition`). */
export type GuardCondition = "empty" | "notFound";

/** The route a guard reads and what it checks it for (interface-dms `GuardOptions`). */
export interface GuardSource {
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
  when?: GuardCondition;
  /** Dot path of the value `empty` checks; the whole answer without it. */
  field?: string;
}

/** What the route answers: any value, maybe with an `emptyState` laid over the fallback. */
export interface GuardResponse {
  emptyState?: GuardFallback;
  [field: string]: unknown;
}

/** Which condition held: the fallback to show, before its defaults. */
export interface GuardState {
  condition: GuardCondition;
  /** The answer's `emptyState`, when the route sent one. */
  override?: GuardFallback;
  /** What the 404 said, for `notFound`: its message sets the default texts. */
  notFound?: FetchNotFound;
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

function answerOverride(answer: unknown): GuardFallback | undefined {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
    return undefined;
  }
  const { emptyState } = answer as GuardResponse;
  return emptyState && typeof emptyState === "object" ? emptyState : undefined;
}

/**
 * The condition that holds, or `null` while the children show: while the
 * route loads, after any failure other than the condition, and whenever the
 * value is set. The route is read like a block's `fetchUrl` (URL tokens,
 * period scope, realtime topics, page refresh); nothing is requested while
 * a token has no value.
 */
export function useGuard(
  options: () => GuardSource,
  routeParams: () => Record<string, string> | undefined,
): ComputedRef<GuardState | null> {
  const initial = options();
  const { data, error } = useChartFetch<unknown>({
    fetchUrl: initial.fetchUrl,
    fetchUrlMethod: initial.fetchUrlMethod,
    periodScope: initial.periodScope,
    realtimeTopic: initial.realtimeTopic,
    routeParams,
  });

  return computed(() => {
    const { when = "empty", field } = options();
    const failure = error.value;
    if (when === "notFound") {
      const notFound = readFetchNotFound(failure);
      if (!notFound) return null;
      return { condition: when, override: notFound.emptyState, notFound };
    }
    const answer = data.value;
    if (failure || answer === null || answer === undefined) return null;
    const value = field ? readFieldPath(answer, field) : answer;
    if (!isEmptyValue(value)) return null;
    return { condition: when, override: answerOverride(answer) };
  });
}

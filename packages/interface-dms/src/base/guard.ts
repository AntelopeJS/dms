import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import {
  blockFetchUrlMethodOption,
  blockPeriodScopeOption,
  blockRealtimeTopicOption,
} from "./display";
import { type EmptyStateProps, EmptyStateSchema } from "./empty-state";
import { attachRealtimeTopicsHook } from "./internal/realtime-topics";
import type { EnumOption } from "./types/enum-option";
import type { HttpMethod } from "./types/http";

/** What a `Guard` checks its route for: see `GuardOptions.when`. */
export const GUARD_CONDITIONS = ["empty", "notFound"] as const;

export type GuardCondition = (typeof GUARD_CONDITIONS)[number];

/**
 * The empty state a `Guard` shows in place of its children: an `EmptyState`'s
 * options, the title included, all optional.
 */
export type GuardFallback = Partial<Omit<EmptyStateProps, "watchActions">>;

/** The options `Guard` takes. */
export interface GuardOptions {
  /**
   * The route read. It takes the tokens of a block's `fetchUrl`
   * (`{{params.X}}`, `{{query.X}}`), and nothing is requested while one has
   * no value: the children show.
   */
  fetchUrl: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Id of the `PeriodSelector` the route is read with, again on each change. */
  periodScope?: string;
  /** Topics whose events make the guard read the route again. */
  realtimeTopic?: string | string[];
  /**
   * When the fallback replaces the children. `empty`: the value at `field` is
   * absent, `null`, `false`, `0`, `""` or `[]`. `notFound`: the route answers
   * 404.
   * @default 'empty'
   */
  when?: GuardCondition;
  /**
   * Dot path of the value `empty` checks (`calls`, `summary.calls`). Without
   * it, `empty` checks the whole answer.
   */
  field?: string;
  /**
   * What shows in place of the children. An `emptyState` object in the
   * answer is laid over it, for a text or a link only the route knows (when
   * the record was last used, a link carrying its id).
   *
   * Optional. Its title defaults to "Nothing to show yet", or "Not found"
   * for `notFound`, in the reader's language.
   */
  fallback?: GuardFallback;
}

const GUARD_COMPONENT_NAME = "dms-guard";
const GUARD_ICON = "i-ph-shield-check";
const GUARD_DEFAULT_CONDITION = "empty";

/** The options `Guard` accepts. */
export const GuardSchema = z.object({
  fetchUrl: ui(
    z
      .string()
      .describe("Route whose answer decides whether the children show."),
    {
      label: "Data source",
      group: "data",
      widget: "dataSource",
      periodOption: "periodScope",
    },
  ),
  fetchUrlMethod: blockFetchUrlMethodOption(),
  periodScope: blockPeriodScopeOption(),
  realtimeTopic: blockRealtimeTopicOption(),
  when: ui(
    z
      .enum(GUARD_CONDITIONS)
      .default(GUARD_DEFAULT_CONDITION)
      .describe("When the fallback replaces the children."),
    {
      label: "Show the fallback when",
      group: "data",
      widget: "segmented",
      valueLabels: { empty: "The value is empty", notFound: "Not found (404)" },
    },
  ),
  field: ui(
    z
      .string()
      .optional()
      .describe("Dot path of the value; empty when falsy or `[]`."),
    { label: "Field", group: "data" },
  ),
  fallback: ui(
    EmptyStateSchema.partial()
      .optional()
      .describe("Empty state shown in place of the children."),
    { label: "Fallback", group: "content" },
  ),
}) satisfies BlockOptionsFor<GuardOptions>;

/**
 * Guard — shows its children unless a route says there is nothing for them:
 * then one `EmptyState` (the `fallback`) takes their place. A route never
 * called shows "No calls yet" and a link to call it, rather than a tab of
 * empty charts; a record that is gone shows "Not found" rather than blocks
 * that each fail on their own.
 *
 * The children show while the route loads, after any failure other than the
 * condition, and whenever the value is set; a realtime event or a new period
 * that sets it brings them back.
 *
 * @example
 * ```typescript
 * Guard({
 *   fetchUrl: '/api/routes/activity?route={{query.route}}', // { calls: 0 }
 *   periodScope: 'api',
 *   field: 'calls',
 *   fallback: {
 *     title: 'No calls yet',
 *     icon: 'i-ph-moon-stars',
 *     actions: [{ label: 'Test this route', to: '/routes?tab=2' }],
 *   },
 * }).child('charts', Grid().child(...))
 *
 * // "Not found" in place of a record's blocks once the record is gone.
 * Guard({ fetchUrl: '/api/routes/{{params.id}}', when: 'notFound' })
 * ```
 *
 * @docsApi
 */
export function Guard(options: GuardOptions): ComponentBuilder<GuardOptions> {
  return attachRealtimeTopicsHook(
    new ComponentBuilder<GuardOptions>(GUARD_COMPONENT_NAME)
      .options({ when: GUARD_DEFAULT_CONDITION, ...options })
      .meta({
        name: "Guard",
        icon: GUARD_ICON,
        description: "Shows its children unless a route says there is nothing",
      }),
    options.realtimeTopic,
  );
}

RegisterBlockType({
  type: "Guard",
  componentName: GUARD_COMPONENT_NAME,
  schema: GuardSchema,
  container: true,
  meta: {
    name: "Guard",
    icon: GUARD_ICON,
    description:
      "Shows its children, or one empty state when a route says there is nothing.",
    group: "layout",
  },
});

import { ComponentBuilder } from "../component";
import { z } from "zod";
import {
  type BlockOptionsFor,
  RegisterBlockType,
  opaqueOption,
  ui,
} from "./block-registry";
import {
  blockCardOption,
  blockEmptyOption,
  type BlockEmptyText,
} from "./display";
import { serializeCustomButtons } from "./table-view/internal/factory-helpers";
import { resolveCustomButtons } from "./table-view/internal/request-filter";
import type { BaseComponentProps } from "./types";
import type {
  RecordAction,
  RecordActionSerialized,
} from "./types/record-action";

/** The options `ActionList` takes. */
export interface ActionListProps extends BaseComponentProps {
  /** Eyebrow title of the card head. `$`-prefixed for an i18n key. */
  title?: string;
  /**
   * The rows, in order: each one its label, `description`, `icon` and
   * `color` (`error` for a destructive one), running its target as a page
   * header button does — a drawer or modal form, an API call after its
   * confirmation, a link. `when` hides a row and `unavailableWhen` disables
   * it, its reason replacing its description, both read on the record.
   */
  actions?: RecordAction[];
  /**
   * The route answering the record the actions read, with `{{params.X}}` and
   * `{{query.X}}` filled from the page URL. Left out, the list reads the
   * record of the page header (`DefaultLayout({ header: { fetchUrl } })`),
   * without a request of its own. Read again after each of its actions, and
   * when the page asks its blocks to refresh.
   */
  fetchUrl?: string;
  /** Card surface around the list; turn it off inside a `Card` block. */
  card?: boolean;
  /** Shown when no action is left to list. */
  empty?: BlockEmptyText;
}

/** The options of an `ActionList` as the client receives them. */
export interface ActionListSerializedOptions extends Omit<
  ActionListProps,
  "actions"
> {
  actions?: RecordActionSerialized[];
}

const ACTION_LIST_COMPONENT_NAME = "dms-action-list-block";
const ACTION_LIST_ICON = "i-ph-lightning";
const ACTION_LIST_DEFAULTS = { card: true } as const;

/**
 * ActionList — a card listing what can be done to the record a page shows
 * (an operator panel, a danger zone): one row per action, with its icon,
 * label and description, opening a drawer or modal, or calling an API after
 * a confirmation. The same actions as the page header's (`RecordAction`):
 * permission, server-side `availability`, and the `when` / `unavailableWhen`
 * conditions read on the record, again after each action.
 *
 * @example
 * ```typescript
 * ActionList({
 *   title: "$saas.wd.operator.title",
 *   actions: [
 *     {
 *       id: "credit",
 *       label: "$saas.wd.operator.credit",
 *       description: "$saas.wd.operator.credit_description",
 *       icon: "i-ph-coins",
 *       unavailableWhen: {
 *         field: "stripeCustomerId",
 *         truthy: false,
 *         reason: "$saas.wd.operator.credit_unavailable",
 *       },
 *       target: { type: "modal", component: CreditForm },
 *     },
 *   ],
 * })
 * ```
 */
export function ActionList(
  options?: ActionListProps,
): ComponentBuilder<ActionListSerializedOptions> {
  const { actions, ...rest } = options ?? {};
  const builder = new ComponentBuilder<ActionListSerializedOptions>(
    ACTION_LIST_COMPONENT_NAME,
  );
  for (const { id, permission, permissionId } of actions ?? []) {
    if (id) builder.button(id, { permission, permissionId });
  }
  return builder
    .options({
      ...ACTION_LIST_DEFAULTS,
      ...rest,
      actions: serializeCustomButtons(actions),
    })
    .onFilter(async (permissions, served, permissionId, context) => ({
      ...served,
      actions: await resolveCustomButtons(
        permissions,
        actions,
        served.actions,
        permissionId,
        context,
      ),
    }))
    .meta({
      name: options?.title || "Action list",
      icon: ACTION_LIST_ICON,
    });
}

/** The options `ActionList` accepts. */
export const ActionListSchema = z.object({
  title: ui(z.string().optional().describe("Eyebrow title of the card."), {
    label: "Title",
    group: "content",
  }),
  actions: ui(
    opaqueOption<RecordAction[]>()
      .optional()
      .describe("The actions, in order, each with its target."),
    { label: "Actions", group: "content", widget: "json" },
  ),
  fetchUrl: ui(
    z
      .string()
      .optional()
      .describe("Route answering the record; defaults to the page header's."),
    { label: "Record", group: "data", advanced: true },
  ),
  card: blockCardOption(ACTION_LIST_DEFAULTS.card),
  empty: blockEmptyOption(),
}) satisfies BlockOptionsFor<ActionListProps>;

RegisterBlockType({
  type: "ActionList",
  componentName: ACTION_LIST_COMPONENT_NAME,
  schema: ActionListSchema,
  meta: {
    name: "Action list",
    icon: ACTION_LIST_ICON,
    description:
      "What can be done to the page's record: one row per action, available by its state.",
    group: "content",
  },
});

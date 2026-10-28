/** @internal @packageDocumentation */
import { serializeActionTarget } from "../../types/internal/action-target";
import { serializeActionConfirm } from "../../internal/confirm-dialog";
import type {
  AddRowActionConfig,
  BulkRowActionConfig,
  CustomRowAction,
  CustomRowActionSerialized,
  RowActionConfigSerialized,
  RowActionRule,
} from "../../types/row-action";
import { LIST_ACTION, VIEW_ACTION, VIEW_ARCHIVED_ACTION } from "./auth";
import type { TableViewCapabilities } from "./factory-helpers";

/** A built-in row action as the options carry it: its confirmation serialized. */
export function serializeRowActionConfig<T extends Record<string, unknown>>(
  config: boolean | BulkRowActionConfig<T> | AddRowActionConfig<T> | undefined,
): boolean | RowActionConfigSerialized | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The published action union includes boolean shorthand and configured actions; this selects the shorthand.
  if (config === undefined || typeof config === "boolean") return config;
  const { confirm, rule, ...rest } = config;
  const served: RowActionConfigSerialized = rest;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Serialization erases the module row generic into the published untyped rule envelope without checking field values.
  if (rule) served.rule = rule as RowActionRule;
  if (confirm) served.confirm = serializeActionConfirm(confirm);
  return served;
}

/** A custom row action as the options carry it. */
export function serializeCustomRowAction<T extends Record<string, unknown>>(
  action: CustomRowAction<T>,
): CustomRowActionSerialized {
  const served: CustomRowActionSerialized = {
    id: action.id,
    label: action.label,
    icon: action.icon,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published serialized action erases the module row generic; no row-value validation occurs during serialization.
    rule: action.rule as RowActionRule | undefined,
    target: serializeActionTarget(action.target),
    isVisible: action.isVisible,
    isDefault: action.isDefault,
    color: action.color,
    variant: action.variant,
    showLabel: action.showLabel,
    bulk: action.bulk,
    deepLink: action.deepLink,
  };
  if (action.confirm) served.confirm = serializeActionConfirm(action.confirm);
  return served;
}

/**
 * The dependencies of each action of a table view, by action id. An action
 * depends on the permission guarding what it reads. The edit form loads its
 * row through the view route: without the view it opens empty, and a value
 * saved from it replaces one it never showed. An export writes its own
 * `@Exported` fields, which may go past the columns the list shows. A delete
 * reads nothing of the row.
 *
 * An action only reached from the table's rows also depends on the `list`
 * that shows them: delete, the archive trio, export, and a form opening over
 * the table. A form opening as its own page is reached by URL — a link in a
 * notification leads a member to the one record they may edit — and does not.
 * `select` serves the relation pickers of other pages and depends on nothing;
 * `restore` is pressed from the archived rows, so it depends on
 * `viewArchived`, and through it on `list`.
 */
export function tableViewActionDependencies(
  capabilities: TableViewCapabilities,
) {
  const listed = [LIST_ACTION];
  const formListed = capabilities.formsArePages ? [] : listed;
  const readsRow = capabilities.hasViewForm ? [VIEW_ACTION] : [];
  const orUndefined = (ids: string[]) => (ids.length > 0 ? ids : undefined);
  return {
    add: orUndefined(formListed),
    edit: orUndefined([...readsRow, ...formListed]),
    [VIEW_ACTION]: orUndefined(formListed),
    delete: listed,
    archive: listed,
    restore: [VIEW_ARCHIVED_ACTION],
    [VIEW_ARCHIVED_ACTION]: listed,
    export: [...readsRow, ...listed],
  };
}

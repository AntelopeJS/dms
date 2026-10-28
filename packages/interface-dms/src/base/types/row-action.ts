import type { ButtonPermission } from "../../component";
import type { ActionTarget, ActionTargetSerialized } from "./action-target";
import type { ButtonVariant } from "./button";
import type { ActionConfirm, ActionConfirmSerialized } from "./confirm-dialog";
import type { ButtonColor, ButtonPlacement } from "./custom-button";
import type { AnyFieldRule, FieldRule } from "./row-action-operators";

export type FieldEqualsRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = FieldRule<T, "equals">;

export type FieldNotEqualsRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = FieldRule<T, "notEquals">;

export type FieldInRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = FieldRule<T, "in">;

export type FieldNotInRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = FieldRule<T, "notIn">;

export type AndRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  and: RowActionRule<T>[];
};

export type OrRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  or: RowActionRule<T>[];
};

export type NotRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  not: RowActionRule<T>;
};

export type LogicalRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = AndRule<T> | OrRule<T> | NotRule<T>;

export type RowActionRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> = AnyFieldRule<T> | LogicalRule<T>;

/** A built-in row action of a table view, configured. */
export interface RowActionConfig<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  isEnabled?: boolean;
  isVisible?: boolean;
  rule?: RowActionRule<T>;
  /** Label in place of the built-in one ("Change roles"). `$`: i18n key. */
  label?: string;
  /** Icon in place of the built-in one. */
  icon?: string;
  /**
   * Asked before the action runs: a fixed dialog, or `{ from }`, a URL
   * (`{{row.id}}` and the row's `{{row.field}}` filled in) answering the
   * dialog the server words for that row — what it takes with it, or why it cannot go.
   * Delete and archive ask a generic confirmation without it; a `from`
   * dialog applies to one row, several rows at once keep the generic one.
   */
  confirm?: ActionConfirm;
}

/** A built-in row action as it reaches the client. */
export interface RowActionConfigSerialized extends Omit<
  RowActionConfig,
  "confirm"
> {
  confirm?: ActionConfirmSerialized;
  successMessage?: string;
  placement?: ButtonPlacement;
}

/** The built-in add action: where its button is drawn, besides the rest. */
export interface AddRowActionConfig<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> extends RowActionConfig<T> {
  /**
   * The table's toolbar (the default), or the header of its page, which the
   * server adds the button to.
   */
  placement?: ButtonPlacement;
}

/**
 * Delete, archive or restore: a built-in action that runs on the selected
 * rows too, and reports what it did.
 */
export interface BulkRowActionConfig<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> extends RowActionConfig<T> {
  /**
   * Toast once the action succeeded, receiving `{ count }`. `$`-prefixed: an
   * i18n key.
   */
  successMessage?: string;
}

/** How a custom row action runs on several rows at once. */
export interface CustomRowActionBulkOptions {
  /**
   * Also offered once the user picks "Select all N matching": the target
   * then receives the table's current filters and search instead of ids,
   * and the route finds the rows itself (`resolveBulkRowIds`).
   */
  allMatching?: true;
}

/**
 * A custom row action offered on the selection bar: `true` for the selected
 * rows, `{ allMatching: true }` for every row the table's filters match too.
 */
export type CustomRowActionBulk = true | CustomRowActionBulkOptions;

export interface CustomRowAction<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row constraint accepts application-owned fields; narrowing it changes the generic contract.
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Names the action for a custom card or display that places it itself: it
   * finds it by this id among the row's actions (`actions.customFor(row)`).
   */
  id?: string;
  /**
   * The action's name, its `{field}` braces filled from the row as
   * translation parameters (`"Translate {name}"`). `$`: an i18n key, whose
   * translation receives the row's fields as parameters. On the selection
   * bar (`bulk`) it names several rows: keep row fields out of it there.
   */
  label: string;
  icon?: string;
  target: ActionTarget;
  /**
   * Asked before the action runs, whatever its target: a fixed dialog (its
   * texts receive the row's fields as parameters, "Remove {name}?"), or
   * `{ from }`, a URL (`{{row.id}}` and the row's `{{row.field}}` filled
   * in) answering the dialog the server words for the row.
   */
  confirm?: ActionConfirm;
  rule?: RowActionRule<T>;
  isVisible?: boolean;
  /**
   * Makes this action the target of a row click, ahead of the built-in
   * `edit`/`details` fallbacks. The first flagged action whose `rule` accepts
   * the row wins. A double-click by default; a single click on a table view
   * declaring `rowClick: "single"`; never with `rowClick: "none"`.
   */
  isDefault?: boolean;
  /**
   * Gate the action behind a permission, like a custom button: a string
   * names one of the table's actions (e.g. `"edit"`), an `Action` any
   * component's. The action is stripped for a caller without it.
   *
   * It only hides the action: the route its target calls must check the
   * permission itself.
   */
  permission?: ButtonPermission;
  /** Absolute permission id the action requires; wins over `permission`. */
  permissionId?: string;
  /** Color of the action: an inline button, or a menu entry. */
  color?: ButtonColor;
  /** Variant of an inline (`isVisible`) button. Defaults to `ghost`. */
  variant?: ButtonVariant;
  /** An inline (`isVisible`) button shows its label next to its icon. */
  showLabel?: boolean;
  /**
   * Offers the action on the selection bar, for the selected rows: an `api`
   * or `exportJob` target receives their `ids` as a repeated query parameter
   * (`?ids=a&ids=b`), a page, external or download URL too, a drawer or
   * modal component a `selection` prop. With `{ allMatching: true }`, "Select all
   * N matching" sends `allMatching=true` and the table's filters and search
   * instead. A fixed confirmation receives `{ count }`. A `{{row.X}}` token
   * has no row to fill there: a query pair whose value is one is left out
   * (`?ids={{row._id}}` gives way to the selection's ids), any other is
   * left empty. The action is still offered on each row, where a URL target
   * receives that row's id the same way (`?ids=<id>`), unless its URL names a
   * row field itself; a drawer or modal there receives `rowData`.
   */
  bulk?: CustomRowActionBulk;
  /**
   * The drawer, modal or side panel the action opens is reflected in the URL
   * (`?record=<id>`, `?<tableId>.record=<id>` on a page with several table
   * views): a link or a reload opens it again on that row. Off by default
   * for a drawer or a modal; on by default for a side panel, which
   * `deepLink: false` opts out of.
   */
  deepLink?: boolean;
}

export interface CustomRowActionSerialized {
  id?: string;
  label: string;
  icon?: string;
  target: ActionTargetSerialized;
  confirm?: ActionConfirmSerialized;
  rule?: RowActionRule;
  isVisible?: boolean;
  /**
   * Makes this action the target of a row click, ahead of the built-in
   * `edit`/`details` fallbacks. The first flagged action whose `rule` accepts
   * the row wins.
   */
  isDefault?: boolean;
  color?: ButtonColor;
  variant?: ButtonVariant;
  showLabel?: boolean;
  bulk?: CustomRowActionBulk;
  deepLink?: boolean;
}

import type { ButtonPermission } from "../../component";
import type { ActionTarget, ActionTargetSerialized } from "./action-target";
import type { ButtonVariant } from "./button";
import type { ActionConfirm, ActionConfirmSerialized } from "./confirm-dialog";
import type { ButtonColor, ButtonPlacement } from "./custom-button";
import type { AnyFieldRule, FieldRule } from "./row-action-operators";

export type FieldEqualsRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = FieldRule<T, "equals">;

export type FieldNotEqualsRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = FieldRule<T, "notEquals">;

export type FieldInRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = FieldRule<T, "in">;

export type FieldNotInRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = FieldRule<T, "notIn">;

export type AndRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  and: RowActionRule<T>[];
};

export type OrRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  or: RowActionRule<T>[];
};

export type NotRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  not: RowActionRule<T>;
};

export type LogicalRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = AndRule<T> | OrRule<T> | NotRule<T>;

export type RowActionRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = AnyFieldRule<T> | LogicalRule<T>;

/** A built-in row action of a table view, configured. */
export interface RowActionConfig<
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
   * (`{id}` and the row's fields are filled in) answering the dialog the
   * server words for that row — what it takes with it, or why it cannot go.
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
  T extends Record<string, unknown> = Record<string, unknown>,
> extends RowActionConfig<T> {
  /**
   * Toast once the action succeeded, receiving `{ count }`. `$`-prefixed: an
   * i18n key.
   */
  successMessage?: string;
}

export interface CustomRowAction<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  label: string;
  icon?: string;
  target: ActionTarget;
  /**
   * Asked before the action runs, whatever its target: a fixed dialog (its
   * texts receive the row's fields as i18n parameters, "Remove {name}?"), or
   * `{ from }`, a URL answering the dialog the server words for the row.
   */
  confirm?: ActionConfirm;
  rule?: RowActionRule<T>;
  isVisible?: boolean;
  /**
   * Makes this action the target of a row click, ahead of the built-in
   * `edit`/`details` fallbacks. The first flagged action whose `rule` accepts
   * the row wins.
   */
  isDefault?: boolean;
  /**
   * Gate the action behind a permission, like a custom button: a string
   * names one of the table's actions (e.g. `"edit"`), an `Action` any
   * component's. The action is stripped for a caller without it.
   */
  permission?: ButtonPermission;
  /** Color of the action: an inline button, or a menu entry. */
  color?: ButtonColor;
  /** Variant of an inline (`isVisible`) button. Defaults to `ghost`. */
  variant?: ButtonVariant;
  /** An inline (`isVisible`) button shows its label next to its icon. */
  showLabel?: boolean;
}

export interface CustomRowActionSerialized {
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
}

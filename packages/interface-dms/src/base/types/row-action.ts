import type { ButtonPermission } from "../../component";
import type { ActionTarget, ActionTargetSerialized } from "./action-target";
import type { ButtonVariant } from "./button";
import type { ButtonColor } from "./custom-button";
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
   * Delete, archive and restore of one row: a URL (`{id}` and the row-id
   * field are filled in) answering a {@link RowActionConfirmDescriptor}, the
   * confirmation the server words for that row — what it takes with it, or
   * why it cannot go. Several rows at once keep the generic confirmation.
   */
  confirmFrom?: string;
  /**
   * Toast once delete, archive or restore succeeded, receiving `{ count }`.
   * `$`-prefixed: an i18n key.
   */
  successMessage?: string;
}

/** One dependent a confirmed action affects, listed in its dialog. */
export interface RowActionConfirmImpact {
  icon: string;
  /** `$`-prefixed: an i18n key, receiving the descriptor's `params`. */
  label: string;
  count?: number | string;
}

/**
 * A confirmation dialog worded by the server for one row. Texts are i18n keys
 * (with `$`) or literals, all interpolated with `params`.
 */
export interface RowActionConfirmDescriptor {
  title: string;
  description: string;
  params?: Record<string, unknown>;
  icon?: string;
  confirmColor?: "primary" | "error" | "warning";
  confirmLabel?: string;
  confirmIcon?: string;
  cancelLabel?: string;
  impact?: RowActionConfirmImpact[];
  /**
   * The action cannot run (the last owner, a locked row): the dialog only
   * explains why, with a close button.
   */
  blocked?: boolean;
}

export interface CustomRowAction<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  label: string;
  icon?: string;
  target: ActionTarget;
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

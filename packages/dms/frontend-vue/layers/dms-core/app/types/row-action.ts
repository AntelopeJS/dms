import type { AnyFieldRule, FieldRule } from "./row-action-operators";
import type { ActionConfirm } from "./confirm-dialog";

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
  /** Label in place of the built-in one (`$`: i18n key). */
  label?: string;
  /** Icon in place of the built-in one. */
  icon?: string;
  /** Asked before the action runs: a fixed dialog, or `{ from }`. */
  confirm?: ActionConfirm;
  /**
   * Delete, archive, restore: toast once the action succeeded, receiving
   * `{ count }` (`$`: i18n key).
   */
  successMessage?: string;
  /** Add: drawn in the page header instead of the toolbar. */
  placement?: "toolbar" | "header";
}

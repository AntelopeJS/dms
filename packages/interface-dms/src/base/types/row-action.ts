import type { ActionTarget, ActionTargetSerialized } from "./action-target";
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
}

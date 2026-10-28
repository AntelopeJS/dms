import type { AnyFieldRule, FieldRule } from "./row-action-operators";
import type { ActionConfirm } from "./confirm-dialog";
import type { DataTypeFormatter } from "../composables/data-types/useDataType";

export type FieldEqualsRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = FieldRule<T, "equals">;

export type FieldNotEqualsRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = FieldRule<T, "notEquals">;

export type FieldInRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = FieldRule<T, "in">;

export type FieldNotInRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = FieldRule<T, "notIn">;

export type AndRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = {
  and: RowActionRule<T>[];
};

export type OrRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = {
  or: RowActionRule<T>[];
};

export type NotRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = {
  not: RowActionRule<T>;
};

export type LogicalRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = AndRule<T> | OrRule<T> | NotRule<T>;

export type RowActionRule<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
> = AnyFieldRule<T> | LogicalRule<T>;

export interface RowActionConfig<
  T extends NonNullable<Parameters<DataTypeFormatter>[3]> = NonNullable<
    Parameters<DataTypeFormatter>[3]
  >,
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

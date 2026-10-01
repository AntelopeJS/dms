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
  /** Label in place of the built-in one (`$`: i18n key). */
  label?: string;
  /** Icon in place of the built-in one. */
  icon?: string;
  /**
   * Delete/archive/restore of one row: URL (`{id}` filled in) answering a
   * {@link RowActionConfirmDescriptor} the dialog is worded from.
   */
  confirmFrom?: string;
  /** Toast once the action succeeded, receiving `{ count }` (`$`: i18n key). */
  successMessage?: string;
}

/** One dependent a confirmed action affects. */
export interface RowActionConfirmImpact {
  icon: string;
  label: string;
  count?: number | string;
}

/** A confirmation worded by the server for one row (texts: i18n keys or literals). */
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
  /** The action cannot run: the dialog only explains why. */
  blocked?: boolean;
}

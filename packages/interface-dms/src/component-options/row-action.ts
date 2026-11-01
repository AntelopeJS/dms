import type { ButtonPlacement } from "./button";
import type { ActionConfirm, ActionConfirmSerialized } from "./confirm-dialog";

type FieldComparatorSingle = <T>(fieldValue: T, ruleValue: T) => boolean;
type FieldComparatorArray = <T>(fieldValue: T, ruleValue: T[]) => boolean;

interface FieldOperatorDefSingle {
  isArray: false;
  compare: FieldComparatorSingle;
}

interface FieldOperatorDefArray {
  isArray: true;
  compare: FieldComparatorArray;
}

type FieldOperatorDef = FieldOperatorDefSingle | FieldOperatorDefArray;

export const FIELD_OPERATORS = {
  equals: {
    isArray: false,
    compare: <T>(fieldValue: T, ruleValue: T) => fieldValue === ruleValue,
  },
  notEquals: {
    isArray: false,
    compare: <T>(fieldValue: T, ruleValue: T) => fieldValue !== ruleValue,
  },
  in: {
    isArray: true,
    compare: <T>(fieldValue: T, ruleValue: T[]) =>
      ruleValue.includes(fieldValue),
  },
  notIn: {
    isArray: true,
    compare: <T>(fieldValue: T, ruleValue: T[]) =>
      !ruleValue.includes(fieldValue),
  },
} as const satisfies Record<string, FieldOperatorDef>;

export type FieldOperatorKey = keyof typeof FIELD_OPERATORS;

type IsArrayOperator<Op extends FieldOperatorKey> =
  (typeof FIELD_OPERATORS)[Op]["isArray"];

/**
 * A rule comparing one field of the row a table view serves. A getter's
 * field holds what it resolved to, so a rule on a getter answering a promise
 * compares the awaited value.
 */
export type FieldRule<
  T extends Record<string, unknown>,
  Op extends FieldOperatorKey,
> = {
  [K in keyof T]: { field: K } & Record<
    Op,
    IsArrayOperator<Op> extends true ? Awaited<T[K]>[] : Awaited<T[K]>
  >;
}[keyof T];

export type AnyFieldRule<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published row generic permits arbitrary application fields; the caller's T owns their value types.
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [Op in FieldOperatorKey]: FieldRule<T, Op>;
}[FieldOperatorKey];

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

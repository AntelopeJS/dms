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

export const FIELD_KEY = "field" as const;

export type FieldOperatorKey = keyof typeof FIELD_OPERATORS;

type IsArrayOperator<Op extends FieldOperatorKey> =
  (typeof FIELD_OPERATORS)[Op]["isArray"];

export type FieldRule<
  T extends Record<string, unknown>,
  Op extends FieldOperatorKey,
> = {
  [K in keyof T]: { field: K } & Record<
    Op,
    IsArrayOperator<Op> extends true ? T[K][] : T[K]
  >;
}[keyof T];

export type AnyFieldRule<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [Op in FieldOperatorKey]: FieldRule<T, Op>;
}[FieldOperatorKey];

export const LOGICAL_OPERATOR_KEYS = ["and", "or", "not"] as const;

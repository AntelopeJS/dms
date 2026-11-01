import * as rowAction from "../../component-options/row-action";

export import FIELD_OPERATORS = rowAction.FIELD_OPERATORS;

export const FIELD_KEY = "field" as const;

export type {
  AnyFieldRule,
  FieldOperatorKey,
  FieldRule,
} from "../../component-options/row-action";

export const LOGICAL_OPERATOR_KEYS = ["and", "or", "not"] as const;
export type LogicalOperatorKey = (typeof LOGICAL_OPERATOR_KEYS)[number];

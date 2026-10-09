import { get } from "@nuxt/ui/runtime/utils/index.js";
import type {
  RecordAction,
  RecordCondition,
  RecordConditionAll,
  RecordConditionAny,
  RecordConditionNot,
  RecordConditionValue,
  RecordData,
  RecordFieldEquals,
  RecordFieldIn,
  RecordFieldTruthy,
  RecordUnavailableCondition,
} from "../../types/record-action";

type ConditionTest = (
  condition: RecordCondition,
  record: RecordData,
) => boolean;

function isTruthy(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

// The first operator a condition carries decides, in this order, so a
// condition's `reason` (or any other key) is never read as one.
const CONDITION_TESTS: ReadonlyArray<readonly [string, ConditionTest]> = [
  [
    "all",
    (condition, record) =>
      (condition as RecordConditionAll).all.every((entry) =>
        matchesRecordCondition(entry, record),
      ),
  ],
  [
    "any",
    (condition, record) =>
      (condition as RecordConditionAny).any.some((entry) =>
        matchesRecordCondition(entry, record),
      ),
  ],
  [
    "not",
    (condition, record) =>
      !matchesRecordCondition((condition as RecordConditionNot).not, record),
  ],
  [
    "equals",
    (condition, record) => {
      const { field, equals } = condition as RecordFieldEquals;
      return get(record, field) === equals;
    },
  ],
  [
    "in",
    (condition, record) => {
      const { field, in: values } = condition as RecordFieldIn;
      return values.includes(get(record, field) as RecordConditionValue);
    },
  ],
  [
    "truthy",
    (condition, record) => {
      const { field, truthy } = condition as RecordFieldTruthy;
      return isTruthy(get(record, field)) === truthy;
    },
  ],
];

/**
 * Whether a `RecordCondition` holds on a record. A condition naming no known
 * operator never holds: an action it gates stays hidden rather than shown on
 * a typo.
 */
export function matchesRecordCondition(
  condition: RecordCondition,
  record: RecordData,
): boolean {
  const test = CONDITION_TESTS.find(([operator]) => operator in condition);
  return test ? test[1](condition, record) : false;
}

/** What an action is on a record: shown or not, and why it is disabled. */
export interface RecordActionState {
  isVisible: boolean;
  isDisabled: boolean;
  /** Why it is disabled: the server's reason, or the condition's. */
  disabledReason?: string;
}

function firstUnavailability(
  conditions: RecordAction["unavailableWhen"],
  record: RecordData,
): RecordUnavailableCondition | undefined {
  if (!conditions) return undefined;
  const list = Array.isArray(conditions) ? conditions : [conditions];
  return list.find((condition) => matchesRecordCondition(condition, record));
}

/**
 * An action's state on the record the page shows. Without a record (not
 * loaded yet, or the page loads none), an action with `when` is hidden and
 * one with `unavailableWhen` disabled without a reason: neither can be known
 * yet. A button the server disabled (`availability`) keeps its own reason.
 */
export function recordActionState(
  action: RecordAction,
  record: RecordData | null | undefined,
): RecordActionState {
  const isVisible =
    !action.when || (!!record && matchesRecordCondition(action.when, record));
  if (action.disabled) {
    return {
      isVisible,
      isDisabled: true,
      disabledReason: action.disabledReason,
    };
  }
  if (!record) return { isVisible, isDisabled: !!action.unavailableWhen };
  const unavailability = firstUnavailability(action.unavailableWhen, record);
  return {
    isVisible,
    isDisabled: !!unavailability,
    disabledReason: unavailability?.reason,
  };
}

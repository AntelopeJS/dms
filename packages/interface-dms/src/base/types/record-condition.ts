import type { CustomButtonUnavailability } from "./custom-button";

/** A value a condition compares a record's field with. */
export type RecordConditionValue = string | number | boolean | null;

/**
 * Holds when the record's `field` equals `equals`. `field` is a dotted path
 * into the record (`plan.name`); a field the record lacks reads `undefined`,
 * which equals nothing, `null` included.
 */
export interface RecordFieldEquals {
  field: string;
  equals: RecordConditionValue;
}

/** Holds when the record's `field` is one of `in`. */
export interface RecordFieldIn {
  field: string;
  in: RecordConditionValue[];
}

/**
 * Holds when the record's `field` is truthy (`truthy: true`) or not
 * (`truthy: false`): an empty string, `0`, `false`, `null`, a missing field
 * and an empty array are not.
 */
export interface RecordFieldTruthy {
  field: string;
  truthy: boolean;
}

/** Holds when every one of `all` holds; an empty list always does. */
export interface RecordConditionAll {
  all: RecordCondition[];
}

/** Holds when one of `any` holds; an empty list never does. */
export interface RecordConditionAny {
  any: RecordCondition[];
}

/** Holds when `not` does not. */
export interface RecordConditionNot {
  not: RecordCondition;
}

/**
 * A declarative test on the record a page shows, evaluated in the browser
 * against the record its header loaded (`DefaultLayout({ header: { fetchUrl
 * } })`) or an `ActionList` reads, and again each time that record is read
 * anew — after every action of the page. Plain data, so it reaches the client
 * as it is written.
 *
 * It only shapes the UI: the route behind an action still refuses an
 * operation the record's state does not allow.
 *
 * @example
 * ```typescript
 * { field: "status", equals: "suspended" }
 * { field: "status", in: ["active", "past_due"] }
 * { field: "stripeCustomerId", truthy: true }
 * { all: [{ field: "billed", truthy: true }, { not: { field: "status", equals: "cancelled" } }] }
 * ```
 */
export type RecordCondition =
  | RecordFieldEquals
  | RecordFieldIn
  | RecordFieldTruthy
  | RecordConditionAll
  | RecordConditionAny
  | RecordConditionNot;

/**
 * A condition disabling an action while it holds, with the reason shown next
 * to it — in a tooltip in the page header, in place of its description in an
 * `ActionList`.
 */
export type RecordUnavailableCondition = RecordCondition &
  CustomButtonUnavailability;

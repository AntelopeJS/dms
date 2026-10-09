import type { CustomButton } from "../composables/table-view/types/custom-button";

/**
 * A text a route answers for a record (`RecordText` of interface-dms): a
 * `$`-prefixed i18n key or a literal. The one alias every record text is
 * typed with, so texts composed client-side can widen it in one place.
 */
export type RecordText = string;

/** A value a condition compares a record's field with. */
export type RecordConditionValue = string | number | boolean | null;

/** The record's `field` (a dotted path) equals `equals`. */
export interface RecordFieldEquals {
  field: string;
  equals: RecordConditionValue;
}

/** The record's `field` is one of `in`. */
export interface RecordFieldIn {
  field: string;
  in: RecordConditionValue[];
}

/** The record's `field` is truthy, or not (`truthy: false`). */
export interface RecordFieldTruthy {
  field: string;
  truthy: boolean;
}

/** Every one of `all` holds. */
export interface RecordConditionAll {
  all: RecordCondition[];
}

/** One of `any` holds. */
export interface RecordConditionAny {
  any: RecordCondition[];
}

/** `not` does not hold. */
export interface RecordConditionNot {
  not: RecordCondition;
}

/** A test on the record a page shows (`RecordCondition` of interface-dms). */
export type RecordCondition =
  | RecordFieldEquals
  | RecordFieldIn
  | RecordFieldTruthy
  | RecordConditionAll
  | RecordConditionAny
  | RecordConditionNot;

/** Why an action cannot run right now. May be an i18n key. */
export interface RecordUnavailability {
  reason: string;
}

/** A condition disabling an action while it holds, and why. */
export type RecordUnavailableCondition = RecordCondition & RecordUnavailability;

/** What an action of a record adds to a button (interface-dms). */
export interface RecordActionFields {
  /** Shown only while it holds on the record. */
  when?: RecordCondition;
  /** Disabled, with the first holding one's reason. */
  unavailableWhen?: RecordUnavailableCondition | RecordUnavailableCondition[];
  /** Page header only: drawn in its "More actions" menu, in this group. */
  menuGroup?: string;
  /** What the action does, under its label. */
  description?: string;
}

/** An action on the record a page shows: a header button or a list row. */
export interface RecordAction extends CustomButton, RecordActionFields {}

/** The record a page or a block reads, by field. */
export type RecordData = Record<string, unknown>;

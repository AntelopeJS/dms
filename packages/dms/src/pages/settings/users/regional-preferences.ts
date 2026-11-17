import type {
  User,
  UserDateFormat,
  UserTimeFormat,
  UserWeekStart,
} from "@antelopejs/interface-dms/auth/db";
import {
  isNull,
  isObject,
  isString,
} from "@antelopejs/interface-dms/utils/internal/type-check";
import type { RegionalPreferencesInput } from "../../../validation";

/**
 * How the Language & region form shows a regional preference left unset:
 * the API stores it as null.
 */
export const AUTOMATIC_PREFERENCE = "auto";

/** The language and regional preferences stored on a user; null is automatic. */
export interface RegionalPreferences {
  language: string | null;
  timeZone: string | null;
  weekStart: UserWeekStart | null;
  timeFormat: UserTimeFormat | null;
  dateFormat: UserDateFormat | null;
}

type RegionalKey = Exclude<keyof RegionalPreferences, "language">;

const REGIONAL_KEYS: RegionalKey[] = [
  "timeZone",
  "weekStart",
  "timeFormat",
  "dateFormat",
];

function assignPreference<K extends RegionalKey>(
  user: User,
  key: K,
  value: RegionalPreferences[K] | undefined,
): void {
  if (value === undefined) return;
  const target: Pick<User, RegionalKey> = user;
  target[key] = value;
}

/**
 * Writes the submitted preferences onto the user row, leaving the ones the
 * body does not name untouched. The caller saves the whole row.
 *
 * @param user The stored user, updated in place
 * @param input Validated body of the Language & region page
 */
export function applyRegionalPreferences(
  user: User,
  input: RegionalPreferencesInput,
): void {
  if (input.language) user.language = input.language;
  for (const key of REGIONAL_KEYS) assignPreference(user, key, input[key]);
}

/** The preferences of `user`, unset ones as null. */
export function readRegionalPreferences(user: User): RegionalPreferences {
  return {
    language: user.language || null,
    timeZone: user.timeZone ?? null,
    weekStart: user.weekStart ?? null,
    timeFormat: user.timeFormat ?? null,
    dateFormat: user.dateFormat ?? null,
  };
}

/** The preferences as the Language & region form shows them. */
export interface RegionFormValues {
  language: string | null;
  timeZone: string;
  weekStart: string;
  timeFormat: string;
  dateFormat: string;
}

function toFormValue(value: string | number | null): string {
  return value === null ? AUTOMATIC_PREFERENCE : String(value);
}

/**
 * The preferences as the Language & region form shows them: each regional
 * one as the text of its select option, "Automatic" when unset.
 */
export function toRegionFormValues(
  preferences: RegionalPreferences,
): RegionFormValues {
  return {
    language: preferences.language,
    timeZone: toFormValue(preferences.timeZone),
    weekStart: toFormValue(preferences.weekStart),
    timeFormat: toFormValue(preferences.timeFormat),
    dateFormat: toFormValue(preferences.dateFormat),
  };
}

function isFieldBag(body: unknown): body is Record<string, unknown> {
  return isObject(body) && !isNull(body);
}

/**
 * A body of the Language & region form as the API takes it: "Automatic"
 * becomes null and the first day of the week a number. Anything else is
 * left for the schema to judge.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- The raw body stays unparsed in and out: a non-object comes back as given, an object with its automatic and week-start values mapped, for regionalPreferencesSchema to judge in the route.
export function fromRegionFormValues(body: unknown): unknown {
  if (!isFieldBag(body)) return body;
  const values = { ...body };
  for (const key of REGIONAL_KEYS) {
    if (values[key] === AUTOMATIC_PREFERENCE) values[key] = null;
  }

  if (isString(values.weekStart)) {
    values.weekStart = Number(values.weekStart);
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The mapped copy of the raw body goes back unparsed, for regionalPreferencesSchema to judge in the route.
  return values;
}

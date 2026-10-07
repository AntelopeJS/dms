import type {
  User,
  UserDateFormat,
  UserTimeFormat,
  UserWeekStart,
} from "@antelopejs/interface-dms/auth/db";
import type { RegionalPreferencesInput } from "../../../validation/regional-preferences.schema";

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
  (user as Pick<User, RegionalKey>)[key] = value;
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

/**
 * The preferences as the Language & region form shows them: each regional
 * one as the text of its select option, "Automatic" when unset.
 */
export function toRegionFormValues(
  preferences: RegionalPreferences,
): Record<string, unknown> {
  const values: Record<string, unknown> = { language: preferences.language };
  for (const key of REGIONAL_KEYS) {
    const value = preferences[key];
    values[key] = value === null ? AUTOMATIC_PREFERENCE : String(value);
  }
  return values;
}

/**
 * A body of the Language & region form as the API takes it: "Automatic"
 * becomes null and the first day of the week a number. Anything else is
 * left for the schema to judge.
 */
export function fromRegionFormValues(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const values = { ...(body as Record<string, unknown>) };
  for (const key of REGIONAL_KEYS) {
    if (values[key] === AUTOMATIC_PREFERENCE) values[key] = null;
  }
  // A select carries its values as text: the week starts on a day number.
  if (typeof values.weekStart === "string") {
    values.weekStart = Number(values.weekStart);
  }
  return values;
}

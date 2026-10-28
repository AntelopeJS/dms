import type {
  User,
  UserDateFormat,
  UserTimeFormat,
  UserWeekStart,
} from "@antelopejs/interface-dms/auth/db";
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

/**
 * The preferences as the Language & region form shows them: each regional
 * one as the text of its select option, "Automatic" when unset.
 */
export function toRegionFormValues(preferences: RegionalPreferences) {
  // oxlint-disable-next-line anti-slop/no-known-value-widening, anti-slop/no-unsafe-dictionary-type -- The form adapter accumulates computed regional keys while retaining its existing open record return contract.
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
/* oxlint-disable anti-slop/no-runtime-typeof -- This pre-schema adapter preserves malformed input for regionalPreferencesSchema to reject, while translating only automatic and week-start representations. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Input remains unparsed until regionalPreferencesSchema runs in the route.
export function fromRegionFormValues(body: unknown) {
  if (!body || typeof body !== "object") return body;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type -- Only container identity is established; field values intentionally remain unknown until schema validation.
  const values = { ...(body as Record<string, unknown>) };
  for (const key of REGIONAL_KEYS) {
    if (values[key] === AUTOMATIC_PREFERENCE) values[key] = null;
  }

  if (typeof values.weekStart === "string") {
    values.weekStart = Number(values.weekStart);
  }
  return values;
}
/* oxlint-enable anti-slop/no-runtime-typeof */

import * as z from "zod";

/** Longest IANA identifier accepted; the longest real one is 32 characters. */
const MAX_TIME_ZONE_LENGTH = 64;
/** Longest locale tag accepted (`en-GB`, `zh-Hant-TW`). */
const MAX_LANGUAGE_LENGTH = 16;
const SUNDAY = 0;
const MONDAY = 1;
const SATURDAY = 6;

/**
 * Whether the runtime knows `timeZone` as an IANA zone. Asking `Intl` rather
 * than a fixed list accepts the aliases browsers report (`UTC`, `Etc/GMT+2`).
 */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Body of the Language & region page. Every field is optional: a save sends
 * the one preference that changed. `null` puts a regional preference back on
 * automatic; the language always has a value.
 */
export const regionalPreferencesSchema = z
  .object({
    language: z.string().min(1).max(MAX_LANGUAGE_LENGTH).optional(),
    timeZone: z
      .string()
      .max(MAX_TIME_ZONE_LENGTH)
      .refine(isKnownTimeZone, "error.invalid_time_zone")
      .nullable()
      .optional(),
    weekStart: z
      .union([z.literal(SUNDAY), z.literal(MONDAY), z.literal(SATURDAY)])
      .nullable()
      .optional(),
    timeFormat: z.enum(["h23", "h12"]).nullable().optional(),
    dateFormat: z.enum(["numeric", "text"]).nullable().optional(),
  })
  .strict();

export type RegionalPreferencesInput = z.infer<
  typeof regionalPreferencesSchema
>;

import * as z from "zod";

export const userNotificationPreferencesSchema = z.record(
  z.string(),
  z.boolean(),
);

/** A partial preference map: one subject, or every subject of a category. */
export const userNotificationPreferencesPatchSchema =
  userNotificationPreferencesSchema.refine(
    (changes) => Object.keys(changes).length > 0,
    { message: "At least one preference is required" },
  );

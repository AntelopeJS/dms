import * as z from "zod";

/** A partial preference map: one subject, or every subject of a category. */
export const userNotificationPreferencesPatchSchema = z
  .record(z.string(), z.boolean())
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "At least one preference is required",
  });

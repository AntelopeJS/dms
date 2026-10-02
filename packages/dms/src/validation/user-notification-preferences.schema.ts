import * as z from "zod";

/** Largest batch of ids one undo of "mark all as read" may reopen. */
const MAX_NOTIFICATION_IDS = 500;

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

export const notificationIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_NOTIFICATION_IDS),
});

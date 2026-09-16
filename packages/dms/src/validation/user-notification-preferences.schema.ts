import * as z from "zod";

export const userNotificationPreferencesSchema = z.record(
  z.string(),
  z.boolean(),
);

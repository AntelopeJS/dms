import type { ScheduledTask } from "node-cron";
import { scheduleCleanupUserInvites } from "./cleanup-user-invites";
import { scheduleSweepStaleExports } from "./sweep-stale-exports";

export * from "./cleanup-user-invites";
export * from "./sweep-stale-exports";

export function registerDmsCrons(): ScheduledTask[] {
  return [scheduleCleanupUserInvites(), scheduleSweepStaleExports()];
}

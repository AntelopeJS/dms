import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SessionModel } from "@antelopejs/interface-dms/auth/db";
import cron, { type ScheduledTask } from "node-cron";
import { getAuthConfig } from "../config";

export const SWEEP_EXPIRED_SESSIONS_CRON_NAME = "sweep-expired-sessions";

const SWEEP_EXPIRED_SESSIONS_SCHEDULE = "30 3 * * *";

/** Deletes the sessions idle for longer than a refresh token lives. */
export async function runSweepExpiredSessions(now = new Date()): Promise<void> {
  const threshold = new Date(
    now.getTime() - getAuthConfig().refreshTokenLifetime,
  );
  await GetModel(SessionModel).deleteInactiveSince(threshold);
}

export function scheduleSweepExpiredSessions(): ScheduledTask {
  return cron.schedule(SWEEP_EXPIRED_SESSIONS_SCHEDULE, () => {
    void runSweepExpiredSessions().catch((error: unknown) => {
      Logging.Error(
        `Cron '${SWEEP_EXPIRED_SESSIONS_CRON_NAME}' failed:`,
        error,
      );
    });
  });
}

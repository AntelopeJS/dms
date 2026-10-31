import { Logging } from "@antelopejs/interface-core/logging";
import cron, { type ScheduledTask } from "node-cron";
import { EXPORT_TTL_MS, sweepStaleExportsAllTenants } from "../utils";

export const SWEEP_STALE_EXPORTS_CRON_NAME = "sweep-stale-exports";

const SWEEP_STALE_EXPORTS_SCHEDULE = "0 * * * *";

export async function runSweepStaleExports(): Promise<void> {
  await sweepStaleExportsAllTenants(EXPORT_TTL_MS);
}

export function scheduleSweepStaleExports(): ScheduledTask {
  return cron.schedule(SWEEP_STALE_EXPORTS_SCHEDULE, () => {
    void runSweepStaleExports().catch((error: unknown) => {
      Logging.Error(`Cron '${SWEEP_STALE_EXPORTS_CRON_NAME}' failed:`, error);
    });
  });
}

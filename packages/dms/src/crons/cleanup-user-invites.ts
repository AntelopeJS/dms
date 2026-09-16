import { Logging } from "@antelopejs/interface-core/logging";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import cron, { type ScheduledTask } from "node-cron";
import { InviteResolutionsModel } from "@antelopejs/interface-dms/db/models/inviteResolutions.model";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  completeInviteResolution,
  decideInvite,
} from "@antelopejs/interface-dms/invite-resolution";
import { getRowInstance } from "@antelopejs/interface-dms/utils/row-instance";

export const CLEANUP_USER_INVITES_CRON_NAME = "cleanup-user-invites";
const CLEANUP_USER_INVITES_SCHEDULE = "0 3 * * *";
const CLEANUP_BATCH_SIZE = 500;
const EPOCH_LOWER_BOUND = new Date(0);

async function decideExpiredRow(row: UserInvite): Promise<void> {
  const invite = UserInviteModel.fromDatabase(row);
  if (!invite) return;
  const tenantId = getRowInstance(row);
  const decisions = GetModel(InviteResolutionsModel, tenantId);
  if (await decisions.getForInvite(tenantId, invite._id)) return;
  try {
    await decideInvite({ tenantId, invite, reason: "expired" });
  } catch (error) {
    // An adverse terminal decision is expected under concurrent cleanup.
    if (!(await decisions.getForInvite(tenantId, invite._id)))
      Logging.Error("Invite expiry decision failed:", error);
  }
}

async function decideExpiredInvites(): Promise<void> {
  const invites = GetModel(UserInviteModel, CROSS_INSTANCE);
  const cutoff = new Date();
  let cursor = "";
  while (true) {
    const rows = await invites.table
      .between("expiresAt", EPOCH_LOWER_BOUND, cutoff)
      .filter((row) => row.key("_id").gt(cursor))
      .orderBy("_id")
      .slice(0, CLEANUP_BATCH_SIZE)
      .run();
    if (!rows.length) return;
    for (const row of rows) await decideExpiredRow(row);
    cursor = rows[rows.length - 1]._id;
    // Tenant-scoped rows can share an id across a page boundary.
    const boundary = await invites.table
      .getAll(cursor)
      .filter((row) => row.key("expiresAt").lt(cutoff))
      .run();
    for (const row of boundary) await decideExpiredRow(row);
  }
}

/** Replays incomplete terminal decisions across tenants; errors preserve snapshots for another run. */
export async function runCleanupUserInvites(): Promise<void> {
  await decideExpiredInvites();
  let cursor = "";
  while (true) {
    const pending = await GetModel(InviteResolutionsModel, CROSS_INSTANCE)
      .table.getAll(false, "completed")
      .filter((row) => row.key("_id").gt(cursor))
      .orderBy("_id")
      .slice(0, CLEANUP_BATCH_SIZE)
      .run();
    if (!pending.length) return;
    for (const row of pending) {
      const resolution = InviteResolutionsModel.fromDatabase(row);
      if (!resolution) continue;
      try {
        await completeInviteResolution(resolution);
      } catch (error) {
        Logging.Error(
          `Invite resolution '${resolution._id}' remains incomplete:`,
          error,
        );
      }
    }
    cursor = pending[pending.length - 1]._id;
  }
}

/** Schedules replayable invitation work on every process, without fleet ownership. */
export function scheduleCleanupUserInvites(): ScheduledTask {
  return cron.schedule(CLEANUP_USER_INVITES_SCHEDULE, () => {
    void runCleanupUserInvites().catch((error: unknown) => {
      Logging.Error(`Cron '${CLEANUP_USER_INVITES_CRON_NAME}' failed:`, error);
    });
  });
}

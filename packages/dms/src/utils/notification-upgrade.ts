import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { SecuritySubject } from "@antelopejs/interface-dms/notifications";
import { SystemStateModel } from "../db/models/systemState.model";
import { UserNotificationsModel } from "../db/models/userNotifications.model";
import type { UserNotification } from "../db/tables/userNotifications.table";
import {
  NOTIFICATIONS_DATA_VERSION,
  needsAccountEmail,
  upgradeLegacyNotification,
} from "./legacy-notifications";

const UPGRADE_BATCH_SIZE = 500;

async function upgradeRow(row: UserNotification): Promise<void> {
  const accountEmail = needsAccountEmail(row)
    ? (await GetModel(UserModel).get(row.userId))?.email
    : undefined;
  const patch = upgradeLegacyNotification(row, accountEmail);
  if (!patch) return;
  await GetModel(UserNotificationsModel).rewrite(row, patch);
}

/** Every alert the upgrade touches is a security one, so only those are read. */
async function upgradeSecurityNotifications(): Promise<void> {
  const notifications = GetModel(UserNotificationsModel);
  let cursor = "";
  while (true) {
    const rows = await notifications.table
      .getAll(SecuritySubject.id, "subjectId")
      .filter((row) => row.key("_id").gt(cursor))
      .orderBy("_id")
      .slice(0, UPGRADE_BATCH_SIZE)
      .run();
    if (rows.length === 0) return;
    for (const row of rows) await upgradeRow(row);
    cursor = rows[rows.length - 1]._id;
  }
}

/**
 * Brings notifications stored before the texts were rewritten to the params
 * the current texts read, once per database: the system state records the
 * version reached. Safe to replay, so two instances starting together only
 * do the work twice.
 */
export async function upgradeStoredNotifications(): Promise<void> {
  const systemState = GetModel(SystemStateModel);
  const state = await systemState.getConfig();
  if (
    !state ||
    (state.notifications_version ?? 0) >= NOTIFICATIONS_DATA_VERSION
  ) {
    return;
  }
  await upgradeSecurityNotifications();
  state.notifications_version = NOTIFICATIONS_DATA_VERSION;
  await systemState.updateConfig(state);
}

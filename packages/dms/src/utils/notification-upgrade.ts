import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  AccountSubject,
  CollaborationSubject,
  SecuritySubject,
} from "@antelopejs/interface-dms/notifications";
import { SystemStateModel } from "../db/models/systemState.model";
import { UserNotificationsModel } from "../db/models/userNotifications.model";
import type { UserNotification } from "../db/tables/userNotifications.table";
import { UPDATES_SUBJECT_ID } from "../dev/module-update-notifications";
import {
  NOTIFICATIONS_DATA_VERSION,
  needsAccountEmail,
  upgradeLegacyNotification,
} from "./legacy-notifications";

const UPGRADE_BATCH_SIZE = 500;
/** The subjects of every DMS message an upgrade step rewrites or recolours. */
const UPGRADED_SUBJECT_IDS = [
  SecuritySubject.id,
  AccountSubject.id,
  CollaborationSubject.id,
  UPDATES_SUBJECT_ID,
];

async function upgradeRow(row: UserNotification): Promise<void> {
  const accountEmail = needsAccountEmail(row)
    ? (await GetModel(UserModel).get(row.userId))?.email
    : undefined;
  const patch = upgradeLegacyNotification(row, accountEmail);
  if (!patch) return;
  await GetModel(UserNotificationsModel).rewrite(row, patch);
}

/**
 * Reads the rows of one subject, dismissed receipts included: an idempotent
 * delivery replayed later compares its tone with theirs.
 */
async function upgradeSubjectNotifications(subjectId: string): Promise<void> {
  const notifications = GetModel(UserNotificationsModel);
  let cursor = "";
  while (true) {
    const rows = await notifications.table
      .getAll(subjectId, "subjectId")
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
 * the current texts read, and to the tones of the current grid, once per
 * database: the system state records the
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
  for (const subjectId of UPGRADED_SUBJECT_IDS) {
    await upgradeSubjectNotifications(subjectId);
  }
  state.notifications_version = NOTIFICATIONS_DATA_VERSION;
  await systemState.updateConfig(state);
}

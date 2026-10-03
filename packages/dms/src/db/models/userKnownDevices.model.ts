import { createHash } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { UserKnownDevice, userKnownDevicesTableName } from "../tables";

function knownDeviceId(userId: string, fingerprint: string): string {
  return createHash("sha256")
    .update(JSON.stringify([userId, fingerprint]))
    .digest("hex");
}

export class UserKnownDevicesModel extends BasicDataModel(
  UserKnownDevice,
  userKnownDevicesTableName,
) {
  /** Fingerprints of every device the user signed in from. */
  async listFingerprints(userId: string): Promise<string[]> {
    const rows = await this.table.getAll(userId, "userId").run();
    return rows.map((row) => row.fingerprint);
  }

  /**
   * Records a sign-in from a device. The row id derives from the user and the
   * fingerprint, so two instances remembering the same device at once collide
   * on the primary key instead of storing it twice.
   */
  async remember(
    userId: string,
    fingerprint: string,
    now: Date,
  ): Promise<void> {
    const id = knownDeviceId(userId, fingerprint);
    const existing = await this.table.get(id).run();
    if (existing) {
      await this.table.get(id).update({ lastSeenAt: now }).run();
      return;
    }
    try {
      await this.table
        .insert({
          _id: id,
          userId,
          fingerprint,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .run();
    } catch (error) {
      if (!(await this.table.get(id).run())) throw error;
    }
  }

  /** Removes the devices of a user whose account is deleted. */
  async purgeUser(userId: string): Promise<void> {
    await this.table.getAll(userId, "userId").delete().run();
  }
}

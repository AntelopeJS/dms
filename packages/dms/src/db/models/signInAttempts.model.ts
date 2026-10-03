import { createHash } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { SignInAttempt, signInAttemptsTableName } from "../tables";

function alertId(userId: string, alertKey: string): string {
  return createHash("sha256")
    .update(JSON.stringify(["alert", userId, alertKey]))
    .digest("hex");
}

export class SignInAttemptsModel extends BasicDataModel(
  SignInAttempt,
  signInAttemptsTableName,
) {
  async recordFailure(userId: string, now: Date): Promise<void> {
    await this.table.insert({ userId, kind: "failed", createdAt: now }).run();
  }

  /** The user's attempts and alerts recorded after `since`. */
  async listSince(userId: string, since: Date): Promise<SignInAttempt[]> {
    const rows = await this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("createdAt").gt(since))
      .run();
    return rows
      .map((row) => SignInAttemptsModel.fromDatabase(row))
      .filter((row): row is SignInAttempt => row !== undefined);
  }

  /**
   * Claims the alert of one burst. The id derives from the burst, so when two
   * instances see the same burst cross the threshold only one insert wins.
   *
   * @returns Whether this caller claimed it and should notify
   */
  async claimAlert(
    userId: string,
    alertKey: string,
    now: Date,
  ): Promise<boolean> {
    const id = alertId(userId, alertKey);
    try {
      await this.table
        .insert({ _id: id, userId, kind: "alerted", createdAt: now })
        .run();
      return true;
    } catch (error) {
      if (!(await this.table.get(id).run())) throw error;
      return false;
    }
  }

  /** Forgets the failed attempts once the right password is given. */
  async clearFailures(userId: string): Promise<void> {
    await this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("kind").eq("failed"))
      .delete()
      .run();
  }

  async pruneBefore(userId: string, before: Date): Promise<void> {
    await this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("createdAt").lt(before))
      .delete()
      .run();
  }

  /** Removes the attempts of a user whose account is deleted. */
  async purgeUser(userId: string): Promise<void> {
    await this.table.getAll(userId, "userId").delete().run();
  }
}

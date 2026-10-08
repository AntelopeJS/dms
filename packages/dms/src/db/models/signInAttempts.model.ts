import { createHash } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { SignInAttempt, signInAttemptsTableName } from "../tables";
import type { SignInAttemptKind } from "../tables/signInAttempts.table";

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

  private recordedSince(userId: string, since: Date, kind: SignInAttemptKind) {
    return this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("createdAt").gt(since))
      .filter((row) => row.key("kind").eq(kind));
  }

  /**
   * What a burst check reads after `since`, bounded whatever the number of
   * rows: the oldest `failureLimit` failures, and one alert if any was
   * claimed.
   */
  async listBurst(
    userId: string,
    since: Date,
    failureLimit: number,
  ): Promise<SignInAttempt[]> {
    const [failures, alerts] = await Promise.all([
      this.recordedSince(userId, since, "failed")
        .orderBy("createdAt")
        .slice(0, failureLimit)
        .run(),
      this.recordedSince(userId, since, "alerted").slice(0, 1).run(),
    ]);
    return [...failures, ...alerts]
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

  private async deleteRecorded(
    userId: string,
    kind: SignInAttemptKind,
  ): Promise<void> {
    await this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("kind").eq(kind))
      .delete()
      .run();
  }

  private twoFactorAttempts(userId: string, challenge: string) {
    return this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("kind").eq("two_factor"))
      .filter((row) => row.key("challenge").eq(challenge));
  }

  /**
   * Counts a code tried against a two-factor challenge. Recorded before the
   * code is checked, so concurrent tries on several instances share one
   * budget: the n-th insert always counts at least n.
   *
   * @returns The tries made against this challenge, this one included
   */
  async recordTwoFactorAttempt(
    userId: string,
    challenge: string,
    now: Date,
  ): Promise<number> {
    await this.table
      .insert({ userId, kind: "two_factor", challenge, createdAt: now })
      .run();
    return this.twoFactorAttempts(userId, challenge).count().run();
  }

  /** The tries made against a two-factor challenge so far. */
  countTwoFactorAttempts(userId: string, challenge: string): Promise<number> {
    return this.twoFactorAttempts(userId, challenge).count().run();
  }

  /** Forgets the failed attempts once the right password is given. */
  async clearFailures(userId: string): Promise<void> {
    await this.deleteRecorded(userId, "failed");
  }

  /**
   * Counts a try of the reset code sent at `requestedAt`. Recorded before the
   * code is compared, so concurrent tries on several instances share one
   * budget: the n-th insert always counts at least n.
   *
   * @returns The tries of that code so far, this one included
   */
  async recordResetCodeAttempt(
    userId: string,
    requestedAt: Date,
    now: Date,
  ): Promise<number> {
    await this.table
      .insert({ userId, kind: "reset_code", createdAt: now })
      .run();
    return this.recordedSince(userId, requestedAt, "reset_code").count().run();
  }

  /**
   * Forgets the reset-code tries once the right code is given, or a new code
   * replaces the one they were counted against.
   */
  async clearResetCodeAttempts(userId: string): Promise<void> {
    await this.deleteRecorded(userId, "reset_code");
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

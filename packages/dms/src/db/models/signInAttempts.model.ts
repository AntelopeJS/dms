import { createHash } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { SignInAttempt, signInAttemptsTableName } from "../tables";
import type { SignInAttemptKind } from "../tables/signInAttempts.table";

// A row id derived from what the row records, so that when two instances
// write the same event only one insert wins.
function derivedId(...parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** Codes tried against one challenge, and by its account within a window. */
export interface TwoFactorTries {
  challengeTries: number;
  accountTries: number;
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
  claimAlert(userId: string, alertKey: string, now: Date): Promise<boolean> {
    return this.insertOnce({
      _id: derivedId("alert", userId, alertKey),
      userId,
      kind: "alerted",
      createdAt: now,
    });
  }

  /** @returns Whether this insert wrote the row, false when it already existed */
  private async insertOnce(row: SignInAttempt): Promise<boolean> {
    try {
      await this.table.insert(row).run();
      return true;
    } catch (error) {
      if (!(await this.table.get(row._id).run())) throw error;
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
   * @param since Start of the window the account's tries are counted over
   * @returns The tries so far, this one included
   */
  async recordTwoFactorAttempt(
    userId: string,
    challenge: string,
    since: Date,
    now: Date,
  ): Promise<TwoFactorTries> {
    await this.table
      .insert({ userId, kind: "two_factor", challenge, createdAt: now })
      .run();
    return this.countTwoFactorAttempts(userId, challenge, since);
  }

  /**
   * The tries made so far against a two-factor challenge, and by its account
   * since `since` across all its challenges.
   */
  async countTwoFactorAttempts(
    userId: string,
    challenge: string,
    since: Date,
  ): Promise<TwoFactorTries> {
    const [challengeTries, accountTries] = await Promise.all([
      this.twoFactorAttempts(userId, challenge).count().run(),
      this.recordedSince(userId, since, "two_factor").count().run(),
    ]);
    return { challengeTries, accountTries };
  }

  /** Id of the account's oldest two-factor try since `since`, if any. */
  async oldestTwoFactorAttempt(
    userId: string,
    since: Date,
  ): Promise<string | undefined> {
    const [oldest] = await this.recordedSince(userId, since, "two_factor")
      .orderBy("createdAt")
      .slice(0, 1)
      .run();
    return oldest?._id;
  }

  /** Forgets the account's two-factor tries once a right code is given. */
  async clearTwoFactorAttempts(userId: string): Promise<void> {
    await this.deleteRecorded(userId, "two_factor");
  }

  /**
   * Marks a two-factor challenge used. The id derives from the challenge, so
   * when two requests complete it at once only one insert wins.
   *
   * @returns Whether this caller claimed it and may open the session
   */
  claimTwoFactorChallenge(
    userId: string,
    challenge: string,
    now: Date,
  ): Promise<boolean> {
    return this.insertOnce({
      _id: derivedId("two_factor_used", challenge),
      userId,
      kind: "two_factor_used",
      challenge,
      createdAt: now,
    });
  }

  /** Whether a two-factor challenge already opened its session. */
  async isTwoFactorChallengeUsed(challenge: string): Promise<boolean> {
    const row = await this.table
      .get(derivedId("two_factor_used", challenge))
      .run();
    return Boolean(row);
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

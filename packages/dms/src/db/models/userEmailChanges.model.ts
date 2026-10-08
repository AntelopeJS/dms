import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { UserEmailChange, userEmailChangesTableName } from "../tables";

/** A pending change as the flow writes it. */
export interface EmailChangeRequest {
  userId: string;
  email: string;
  codeHash: string;
  requestedAt: Date;
}

/** A change whose code is still live. */
export interface PendingEmailChange extends UserEmailChange {
  codeHash: string;
}

function isPending(
  change: UserEmailChange | undefined,
): change is PendingEmailChange {
  return !!change?.codeHash;
}

export class UserEmailChangesModel extends BasicDataModel(
  UserEmailChange,
  userEmailChangesTableName,
) {
  /** The user's latest change, pending or closed. */
  async findLatest(userId: string): Promise<UserEmailChange | undefined> {
    const row = await this.table.get(userId).run();
    return row ? UserEmailChangesModel.fromDatabase(row) : undefined;
  }

  /** The user's pending change, if any: one whose code is still live. */
  async findPending(userId: string): Promise<PendingEmailChange | undefined> {
    const latest = await this.findLatest(userId);
    return isPending(latest) ? latest : undefined;
  }

  /** Whether any user had a code sent to an address since a date. */
  async wasSentToSince(email: string, since: Date): Promise<boolean> {
    const rows = await this.table
      .getAll(email, "email")
      .filter((row) => row.key("requestedAt").gt(since))
      .slice(0, 1)
      .run();
    return rows.length > 0;
  }

  /** Records a change, replacing the user's previous one. */
  async replacePending(request: EmailChangeRequest): Promise<void> {
    await this.table
      .insert(
        { _id: request.userId, ...request, attempts: 0 },
        { conflict: "replace" },
      )
      .run();
  }

  /**
   * Counts one code tried against the pending change, in one database update
   * so concurrent tries each take their own turn.
   *
   * @returns The tries counted so far, this one included
   */
  async countAttempt(userId: string): Promise<number> {
    await this.table
      .get(userId)
      .update((row) => ({ attempts: row.key("attempts").default(0).add(1) }))
      .run();
    return (await this.findLatest(userId))?.attempts ?? 0;
  }

  /**
   * Ends the pending change, confirmed, cancelled or burnt. The row stays so
   * the resend limits still apply.
   */
  async close(userId: string): Promise<void> {
    await this.table.get(userId).update({ codeHash: null }).run();
  }

  /** Drops every change of a user whose account is deleted. */
  async purgeUser(userId: string): Promise<void> {
    await this.table.getAll(userId, "userId").delete().run();
  }
}

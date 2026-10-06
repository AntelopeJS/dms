import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { UserEmailChange, userEmailChangesTableName } from "../tables";

/** A pending change as the flow writes it. */
export interface EmailChangeRequest {
  userId: string;
  email: string;
  codeHash: string;
  requestedAt: Date;
}

export class UserEmailChangesModel extends BasicDataModel(
  UserEmailChange,
  userEmailChangesTableName,
) {
  /** The user's pending change, if any. */
  async findPending(userId: string): Promise<UserEmailChange | undefined> {
    const row = await this.table.get(userId).run();
    return row ? UserEmailChangesModel.fromDatabase(row) : undefined;
  }

  /** Records a change, replacing the one already pending. */
  async replacePending(request: EmailChangeRequest): Promise<void> {
    await this.table
      .insert({ _id: request.userId, ...request }, { conflict: "replace" })
      .run();
  }

  /** Drops the pending change of a user, confirmed, cancelled or deleted. */
  async purgeUser(userId: string): Promise<void> {
    await this.table.getAll(userId, "userId").delete().run();
  }
}

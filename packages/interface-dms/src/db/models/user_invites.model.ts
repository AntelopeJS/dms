import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { getRowInstance } from "../../utils/row-instance";
import {
  USER_INVITES_TABLE_NAME,
  UserInvite,
} from "../tables/user_invites.table";

interface InviteWithTenant {
  invite: UserInvite;
  tenantId: string;
}

export class UserInviteModel extends BasicDataModel(
  UserInvite,
  USER_INVITES_TABLE_NAME,
) {
  /**
   * Get an invite by the email it was sent to
   *
   * @param email The email the invite was sent to
   * @returns The invite or undefined if not found
   */
  getByEmail(email: string): Promise<UserInvite | undefined> {
    return this.table
      .getAll(email, "email")
      .nth(0)
      .default(undefined)
      .run()
      .then((res) => (res ? UserInviteModel.fromDatabase(res) : undefined));
  }

  /**
   * Get an invite by its token
   *
   * @param token The token of the invite
   * @returns The invite or undefined if not found
   */
  getByToken(token: string): Promise<UserInvite | undefined> {
    return this.table
      .getAll(token, "token")
      .nth(0)
      .default(undefined)
      .run()
      .then((res) => (res ? UserInviteModel.fromDatabase(res) : undefined));
  }

  /**
   * Get an invite by token along with the tenant it belongs to.
   * Intended for cross-tenant lookups during unauthenticated flows like signup.
   *
   * @param token The token of the invite
   * @returns The invite and its tenant id, or undefined if not found
   */
  async getByTokenWithTenant(
    token: string,
  ): Promise<InviteWithTenant | undefined> {
    const row = await this.table
      .getAll(token, "token")
      .nth(0)
      .default(undefined)
      .run();
    if (!row) return undefined;
    const invite = UserInviteModel.fromDatabase(row);
    if (!invite) return undefined;
    return { invite, tenantId: getRowInstance(row) };
  }

  /**
   * Delete an invite by its token
   *
   * @param token The token of the invite
   */
  deleteByToken(token: string) {
    return this.table.getAll(token, "token").delete().run();
  }
}

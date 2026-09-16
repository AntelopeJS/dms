import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  USER_EXTERNAL_IDENTITIES_TABLE_NAME,
  UserExternalIdentity,
} from "../tables/userExternalIdentities.table";

/**
 * Deterministic row id of a provider account binding. Being the primary key,
 * it is what makes the binding unique — see the table's TSDoc.
 */
export function buildExternalIdentityId(
  provider: string,
  providerAccountId: string,
): string {
  return `${provider}:${providerAccountId}`;
}

export class UserExternalIdentityModel extends BasicDataModel(
  UserExternalIdentity,
  USER_EXTERNAL_IDENTITIES_TABLE_NAME,
) {
  /**
   * Resolve the identity a provider account is bound to.
   *
   * @param provider Provider identifier
   * @param providerAccountId Account identifier on the provider side
   * @returns The bound identity, or undefined when the account is unknown
   */
  async getByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<UserExternalIdentity | undefined> {
    return await this.get(buildExternalIdentityId(provider, providerAccountId));
  }

  getByUserId(userId: string): Promise<UserExternalIdentity[]> {
    return this.table
      .getAll(userId, "userId")
      .run()
      .then((rows) =>
        rows
          .map((row) => UserExternalIdentityModel.fromDatabase(row))
          .filter((identity) => identity !== undefined),
      );
  }

  deleteByUserId(userId: string): Promise<void> {
    return this.table
      .getAll(userId, "userId")
      .delete()
      .run()
      .then(() => undefined);
  }
}

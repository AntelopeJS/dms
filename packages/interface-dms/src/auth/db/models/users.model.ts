import { ValueProxy } from "@antelopejs/interface-database";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { USERS_TABLE_NAME, User } from "../tables/users.table";

export class UserModel extends BasicDataModel(User, USERS_TABLE_NAME) {
  /**
   * Get the user by their email
   *
   * @param email The email of the user
   * @returns The user or undefined if not found
   */
  getByEmail(email: string): Promise<User | undefined> {
    return this.table
      .getAll(email, "email")
      .nth(0)
      .default(undefined)
      .run()
      .then((res) => (res ? UserModel.fromDatabase(res) : undefined));
  }

  async getOwners(): Promise<User[]> {
    return await this.table
      .filter((user) => user.key("owner").eq(true))
      .run()
      .then((res) =>
        res
          .map((user) => UserModel.fromDatabase(user))
          .filter((user) => user !== undefined),
      );
  }

  async countOwnersExcluding(excludedIds: string[]): Promise<number> {
    if (excludedIds.length === 0) {
      return this.table
        .filter((user) => user.key("owner").eq(true))
        .count()
        .run();
    }
    return this.table
      .filter((user) =>
        user
          .key("owner")
          .eq(true)
          .and(
            ValueProxy.constant<string[]>(excludedIds)
              .includes(user.key("_id"))
              .not(),
          ),
      )
      .count()
      .run();
  }
}

import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { ROLES_TABLE_NAME, Role } from "../tables/roles.table";

export class RoleModel extends BasicDataModel(Role, ROLES_TABLE_NAME) {
  /**
   * Get the role by its name
   *
   * @param name The name of the role
   * @returns The role or undefined if not found
   */
  getByName(name: string): Promise<Role | undefined> {
    return this.table
      .getAll(name, "name")
      .nth(0)
      .default(undefined)
      .run()
      .then((res) => (res ? RoleModel.fromDatabase(res) : undefined));
  }
}

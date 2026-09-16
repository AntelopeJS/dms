import { ValueProxy } from "@antelopejs/interface-database";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { getRowInstance } from "../../utils/row-instance";
import { TenantMember, tenantMembersTableName } from "../tables";

export class TenantMemberModel extends BasicDataModel(
  TenantMember,
  tenantMembersTableName,
) {
  async getByUser(userId: string): Promise<TenantMember | undefined> {
    const result = await this.table
      .getAll(userId, "userId")
      .nth(0)
      .default(undefined)
      .run();
    return result ? TenantMemberModel.fromDatabase(result) : undefined;
  }

  async existsByUser(userId: string): Promise<boolean> {
    const count = await this.table.getAll(userId, "userId").count().run();
    return count > 0;
  }

  async listAll(): Promise<TenantMember[]> {
    const rows = await this.table.run();
    return rows
      .map((row) => TenantMemberModel.fromDatabase(row))
      .filter((member): member is TenantMember => member !== undefined);
  }

  async listOwners(): Promise<TenantMember[]> {
    const rows = await this.table
      .filter((row) => row.key("isTenantOwner").eq(true))
      .run();
    return rows
      .map((row) => TenantMemberModel.fromDatabase(row))
      .filter((member): member is TenantMember => member !== undefined);
  }

  async listByUserWithTenantIds(
    userId: string,
  ): Promise<Array<{ tenantId: string; member: TenantMember }>> {
    const rows = await this.table.getAll(userId, "userId").run();
    const result: Array<{ tenantId: string; member: TenantMember }> = [];
    for (const row of rows) {
      const member = TenantMemberModel.fromDatabase(row);
      if (!member) continue;
      result.push({ tenantId: getRowInstance(row), member });
    }
    return result;
  }

  async getOldestByUser(
    userId: string,
  ): Promise<{ tenantId: string; member: TenantMember } | undefined> {
    const row = await this.table
      .getAll(userId, "userId")
      .orderBy("joinedAt", "asc")
      .nth(0)
      .default(undefined)
      .run();
    if (!row) return undefined;
    const member = TenantMemberModel.fromDatabase(row);
    if (!member) return undefined;
    return { tenantId: getRowInstance(row), member };
  }

  async countOwnersExcluding(excludedUserIds: string[]): Promise<number> {
    if (excludedUserIds.length === 0) {
      return this.table
        .filter((row) => row.key("isTenantOwner").eq(true))
        .count()
        .run();
    }
    return this.table
      .filter((row) =>
        row
          .key("isTenantOwner")
          .eq(true)
          .and(
            ValueProxy.constant<string[]>(excludedUserIds)
              .includes(row.key("userId"))
              .not(),
          ),
      )
      .count()
      .run();
  }
}

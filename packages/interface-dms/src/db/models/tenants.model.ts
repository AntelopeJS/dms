import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { Tenant, tenantsTableName } from "../tables";

export class TenantModel extends BasicDataModel(Tenant, tenantsTableName) {
  async getMany(ids: string[]): Promise<Tenant[]> {
    if (ids.length === 0) return [];
    const rows = await this.table.getAll(ids).run();
    return rows
      .map((row) => TenantModel.fromDatabase(row))
      .filter((tenant): tenant is Tenant => tenant !== undefined);
  }
}

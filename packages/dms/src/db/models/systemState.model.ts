import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { SystemState, systemStateTableName } from "../tables";

export class SystemStateModel extends BasicDataModel(
  SystemState,
  systemStateTableName,
) {
  /**
   * Get the system state row
   *
   * @returns The system state row
   */
  getConfig(): Promise<SystemState | undefined> {
    return this.table
      .nth(0)
      .default(undefined)
      .run()
      .then((res) => (res ? SystemStateModel.fromDatabase(res) : undefined));
  }

  /**
   * Update the system state row, addressed by the key it was read with.
   *
   * @param config The config to update, as returned by {@link getConfig}
   */
  updateConfig(config: SystemState) {
    return this.update(config);
  }
}

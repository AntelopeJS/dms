import { Controller, Get } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { Model } from "@antelopejs/interface-database-decorators";
import { getConfig } from "../config";
import { SystemStateModel } from "../db";

/**
 * Public controller for system state
 * This endpoint is accessible without authentication so the frontend can know
 * whether onboarding has already been completed.
 */
export class PublicSystemStateController extends Controller(
  "/api/system-state",
) {
  @Model(SystemStateModel)
  declare model: SystemStateModel;

  @Get("/")
  async getSystemState() {
    const state = await this.model.getConfig();
    assert(state, 428, "System state not found");

    const meta = getConfig().meta;
    return {
      // oxlint-disable-next-line typescript/no-misused-spread -- Return the state's enumerable data fields with response metadata, not its class prototype.
      ...state,
      meta: {
        title: state.platform_name || meta?.title || "",
        description: meta?.description || "",
      },
    };
  }
}

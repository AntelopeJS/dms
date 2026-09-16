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
      // The spread row is an AntelopeJS table class: `Table` declares one
      // field and a static, no instance methods, and the value is
      // serialised to JSON on the way out. No prototype to lose.
      // oxlint-disable-next-line typescript/no-misused-spread
      ...state,
      meta: {
        title: meta?.title || "",
        description: meta?.description || "",
      },
    };
  }
}

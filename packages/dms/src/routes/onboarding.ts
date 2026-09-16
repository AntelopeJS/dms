import { Controller, Get, JSONBody, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { Model } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { applyTenantOwnership } from "@antelopejs/interface-dms/tenant-ownership";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { SystemStateModel } from "../db";
import { generateAuthKey } from "../utils/auth-key";
import { onboardingRegisterAdminSchema } from "../validation/onboarding";

export class PublicOnboardingController extends Controller("/api/onboarding") {
  @Model(SystemStateModel)
  declare model: SystemStateModel;

  @Get("/informations")
  async getInformations(@Model(UserModel) userModel: UserModel) {
    const settings = await this.model.getConfig();

    assert(settings, 428, "error.settings_not_found");

    if (settings.has_onboarded) {
      return { has_onboarded: true };
    }

    const users = await userModel.table.slice(0, 1).run();
    const hasUsers = users.length > 0;

    if (hasUsers) {
      // The spread row is an AntelopeJS table class: `Table` declares one
      // field and a static, no instance methods, and the value is
      // serialised to JSON on the way out. No prototype to lose.
      // oxlint-disable-next-line typescript/no-misused-spread
      await this.model.updateConfig({ ...settings, has_onboarded: true });
    }

    return { has_onboarded: hasUsers };
  }

  @Post("/register")
  async postRegister(
    @Model(UserModel) userModel: UserModel,
    @JSONBody() body: unknown,
  ) {
    const data = assertValidation(body, (v) =>
      onboardingRegisterAdminSchema.parse(v),
    );

    const users = await userModel.table.slice(0, 1).run();

    assert(users.length === 0, 400, "error.admin_already_set");

    const insertedIds = await userModel.insert({
      name: data.name,
      email: data.email,
      password: data.password,
      createdAt: new Date(),
      updatedAt: new Date(),
      isValidated: true,
      authKey: generateAuthKey(),
      owner: true,
      language: "en",
    });

    const newUserId = insertedIds[0];
    assert(newUserId, 500, "error.user_creation_failed");

    await applyTenantOwnership(userModel, newUserId, DEFAULT_TENANT_ID, {
      roleIds: [],
      isTenantOwner: true,
    });
    await this.completeOnboarding();

    return insertedIds;
  }

  private async completeOnboarding() {
    const settings = await this.model.getConfig();

    assert(settings, 428, "error.settings_not_found");
    assert(!settings.has_onboarded, 412, "error.onboarding_already_completed");

    // The spread row is an AntelopeJS table class: `Table` declares one
    // field and a static, no instance methods, and the value is
    // serialised to JSON on the way out. No prototype to lose.
    // oxlint-disable-next-line typescript/no-misused-spread
    await this.model.updateConfig({ ...settings, has_onboarded: true });
  }
}

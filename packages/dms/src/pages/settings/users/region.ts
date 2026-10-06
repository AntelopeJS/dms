import { Get, JSONBody, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { Model } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { regionalPreferencesSchema } from "../../../validation/regional-preferences.schema";
import { userCategory } from "./category";
import {
  applyRegionalPreferences,
  fromRegionFormValues,
  readRegionalPreferences,
  toRegionFormValues,
} from "./regional-preferences";
import { regionPreferencesForm } from "./region-form";

const HTTP_NOT_FOUND = 404;

/**
 * The language the dashboard speaks and how it writes dates and times: time
 * zone, first day of the week, clock and date format. Stored on the user, so
 * every device follows them; each one saves as soon as it is picked.
 */
@RegisterPage()
export class RegionSettingsController extends PageController("region", {
  displayName: "$menu.region",
  category: userCategory,
  icon: "i-ph-globe-hemisphere-west",
  order: 2,
  description: "$page.settings.description.region",
}) {
  static regionComponent = regionPreferencesForm().meta({
    name: "$menu.region",
    icon: "i-ph-globe-hemisphere-west",
  });

  static formatsComponent = CustomComponent("DmsRegionFormatPreview").meta({
    name: "$page.settings.region.preview_title",
    icon: "i-ph-eye",
  });

  @AuthUserWithPermission(RegionSettingsController)
  declare user: User;

  @Get("/preferences")
  getPreferences(): Record<string, unknown> {
    return toRegionFormValues(readRegionalPreferences(this.user));
  }

  /** Saves the preferences the body names; returns all of them. */
  @Post("/preferences")
  async updatePreferences(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ): Promise<Record<string, unknown>> {
    const input = assertValidation(fromRegionFormValues(body), (value) =>
      regionalPreferencesSchema.parse(value),
    );
    // The whole stored row is written back: a partial update would drop the
    // fields it does not name, the password hash among them.
    const stored = await userModel.get(this.user._id);
    assert(stored, HTTP_NOT_FOUND, "error.user_not_found");
    applyRegionalPreferences(stored, input);
    await userModel.update(stored);
    return toRegionFormValues(readRegionalPreferences(stored));
  }
}

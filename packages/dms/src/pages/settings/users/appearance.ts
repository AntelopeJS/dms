import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { userCategory } from "./category";

@RegisterPage()
export class AppearanceSettingsController extends PageController(
  "appearance",
  {
    displayName: "$menu.appearance",
    category: userCategory,
    icon: "i-ph-swatches",
    order: 7,
    description: "$page.settings.description.appearance",
  },
  FormPageLayout(),
) {
  static appearanceComponent = CustomComponent("DmsSettingsAppearance").meta({
    name: "$menu.appearance",
    icon: "i-ph-swatches",
  });
}
